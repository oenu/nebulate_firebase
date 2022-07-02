/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios, {AxiosError} from "axios";
import type {NebulaVideo} from "../types";
import getAuth from "../auth/auth";

const videoScrapeLimit = 3000;

const scrapeNebula = functions.https.onRequest(
    async (req: functions.Request, res: functions.Response) => {
      // Check for auth
      const functionAuth = req.body.functionAuth;
      if (!functionAuth) {
        res.status(400).send("Missing functionAuth");
        return;
      } else {
        if (functionAuth !== process.env.FUNCTION_AUTH) {
          res.status(401).send("Invalid functionAuth");
          return;
        }
      }


      try {
        const channelSlug = req.body.channelSlug;

        let deepScrape = req.body.deepScrape;
        if (deepScrape === "true") {
          console.log("Deep scrape enabled - string");
          deepScrape = true;
        } else {
          deepScrape = false;
        }

        if (channelSlug === undefined) {
          res.status(400).send("channelSlug is undefined");
          return;
        }


        // Check channel exists
        const channelRef = admin.firestore().
            collection("channels").doc(channelSlug);
        const channelDoc = await channelRef.get();
        if (!channelDoc.exists) {
          res.status(400).send("Channel not found");
          return;
        }

        // Get existing videos
        const existingVideoIds = channelDoc.data()?.nebulaVideos.map(
            (video: NebulaVideo) => video.nebulaVideoId);
        console.log("Existing video ids:", existingVideoIds);

        // Get auth token
        const {token} = await getAuth();
        const videoBuffer = [];
        let urlBuffer;


        for (let scrapedVideos = 0; scrapedVideos < videoScrapeLimit; ) {
          const url = `https://content.watchnebula.com/video/channels/${channelSlug}/`;
          const requestUrl: string = urlBuffer ? urlBuffer : url;

          // Get the next page of videos
          let response;
          try {
            response = await axios.get(requestUrl, {
              data: {
                Authorization: `Bearer ${token}`,
              },
            });
          } catch (error) {
            if (error instanceof AxiosError) {
              if (error?.response?.status === 404) {
                res.status(404).send("Channel not found");
                return;
              } else if (error?.response?.status === 429) {
                // If the request was rate limited, wait and try again
                console.debug(
                    "nebula: Rate limited, waiting and trying again in 1 minute"
                );
                await new Promise((resolve) => setTimeout(resolve, 60000));
                response = await axios.get(requestUrl, {
                  data: {
                    Authorization: `Bearer ${token}`,
                  },
                });
              }
            }
          }


          if (!response?.data) break;
          // Add the videos from the response to the buffer
          const newEpisodes = response.data.episodes.results;
          scrapedVideos += newEpisodes.length;
          urlBuffer = response.data.episodes.next;
          console.debug(`nebula: Scraped ${newEpisodes.length} videos`);

          /**
           * If deepScrape is true, check if the video
          * is already in the Video collection
          */

          if (deepScrape === false || deepScrape === undefined) {
            console.debug("nebula: Only scraping new videos");

            // Check if the video is already in the collection
            // const existingVideoIds = existingMap.map(
            //     (existingVideo:any) => existingVideo.nebulaVideoId);
            // console.log(`nebula: ${existingVideoIds.length
            // } videos already in collection`);


            // Remove the existing videos from the new episodes
            const newVideos = newEpisodes.filter(
                (video:any) => !existingVideoIds.includes(video.id));


            // If no new videos were found, break the loop
            if (newVideos.length === 0) {
              console.log(`nebula: No new videos found for ${channelSlug}`);
              break;
            }

            /**
             * If some videos are new and some not, we are at
            * the end of the new videos, so break the loop
            * */
            if (newVideos.length > 0 && newVideos.
                length < newEpisodes.length) {
              console.debug(
                  // eslint-disable-next-line max-len
                  `nebula: ${newVideos.length} new videos found for: ${channelSlug}`
              );
              videoBuffer.push(...newVideos);
              break;
            }


            // If all videos are new, continue to the next page
            if (newVideos.length === newEpisodes.length) {
              console.debug(
                  `nebula: All new videos found: ${
                    channelSlug}, scraping again`
              );
              videoBuffer.push(...newVideos);
            }
          }

          // If no next page was found, break the loop
          if (response.data.episodes.next === null) {
            console.debug("nebula: Reached end of Next-Redirects");
            break;
          }
        }
        if (videoBuffer.length === 0) {
          console.error(`nebula: No videos found for ${channelSlug}`);
          res.send("No new videos found for" + channelSlug);
          return;
        }

        // Remove undefined videos
        videoBuffer.filter((video:any) => video !== undefined ||
        video !== null);


        // Generate a list of videos to be added to the database
        const convertedVideos = videoBuffer.map(
            (video: any): NebulaVideo => {
              return {
                nebulaVideoId: video.id,
                slug: video.slug,
                title: video.title,
                shortDescription: video.short_description,
                duration: video.duration,
                published_at: new Date(video.published_at),
                channelId: video.channel_id,
                channelSlug: video.channel_slug,
                channelSlugs: video.channel_slugs,
                channelTitle: video.channel_title,
                shareUrl: video.share_url,
                matched: false,
              };
            }
        );
        console.debug(
            `nebula: Found ${convertedVideos.length} Nebula videos for ${
              channelSlug} with a limit of ${videoScrapeLimit}`
        );

        // Add the videos to the database
        const batch = admin.firestore().batch();


        // Add videos to channel collections
        convertedVideos.forEach(async (video: any) => {
          const videoRef = channelRef.
              collection("nebulaVideos").doc(video.nebulaVideoId);
          batch.create(videoRef, video);
        });

        // Add Videos to channel array
        channelRef.update({
          nebulaVideos: admin.firestore.FieldValue.
              arrayUnion(...convertedVideos.map(
                  (video: any) => video.nebulaVideoId))}),

        batch.update(channelRef, {
          lastScrapedNebula: new Date(),
        });

        await batch.commit();
        console.debug(`nebula: Added ${
          convertedVideos.length} videos to ${
          channelSlug}`);


        res.send(`Scraped ${convertedVideos.
            length} videos for ${channelSlug}`);
        return;
      } catch (error) {
        console.error(error);
        if (!res.headersSent)res.status(500).send(error);
      }
    }
);

export default scrapeNebula;
