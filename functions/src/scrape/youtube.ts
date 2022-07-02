/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {youtube} from "@googleapis/youtube";
const yt = youtube("v3");

import type {YoutubeVideo} from "../types";


const videoScrapeLimit = 6000;


const youtubeScrape = functions.https.onRequest(
    async (req: functions.Request, res: functions.Response) => {
      try {
        const channelSlug = req.body.channelSlug;
        const deepScrape = req.body;
        if (channelSlug === undefined) {
          res.status(400).send("channelSlug is undefined");
          return;
        }

        // Check channel exists
        const channelDoc = await admin.firestore().collection("channels").
            doc(channelSlug).get();
        if (!channelDoc.exists) {
          res.status(400).send("Channel not found");
          return;
        }


        // Get auth token
        const videoBuffer: any = [];
        let pagetokenBuffer = "";

        console.log(channelDoc.get("uploadPlaylistId"));
        if (channelDoc.get("uploadPlaylistId") === undefined ||
         channelDoc.get("uploadPlaylistId") === null) {
          res.status(400).send("Channel upload id not found");
          return;
        }

        for (let scrapedVideos = 0; scrapedVideos < videoScrapeLimit; ) {
          const pageToken = pagetokenBuffer ? pagetokenBuffer : "";

          // Get the next page of videos
          const response = await yt.playlistItems.list({
            playlistId: channelDoc.get("uploadPlaylistId"),
            auth: process.env.YOUTUBE_API_KEY as string,
            part: ["snippet", "contentDetails", "status", "id"],
            maxResults: videoScrapeLimit,
            pageToken: pageToken,
          });


          if (response.data.items) {
            // Add the videos to the videoBuffer
            const newEpisodes = response.data.items;
            newEpisodes.forEach((episode) => {
              videoBuffer.push(episode);
              scrapedVideos++;
            });

            // Set the pagetokenBuffer to the next page token
            if (response.data.nextPageToken) {
              pagetokenBuffer = response?.data?.nextPageToken;
            } else {
              console.debug("youtube: Reached end of page tokens");
              scrapedVideos = videoScrapeLimit * 2;
            }
            /**
           * If deepScrape is true, check if the video
          * is already in the Video collection
          */

            if (deepScrape === false) {
              console.debug("youtube: Only scraping new videos");

              // Get the video ids from the response

              const videoIds = newEpisodes.map((video:any) => video.
                  contentDetails.videoId);

              // Get the videos from the creator
              const clashingVideos = await admin.firestore()
                  .collection("channels")
                  .doc(channelSlug).collection("youtubeVideos")
                  .where("youtubeVideoId", "in", videoIds).get();
              const clashingVideoIds = clashingVideos.docs
                  .map((video:any) => video.id);

              // Remove the clashing videos from the new videos
              const newVideos = newEpisodes.
                  filter((video:any) => !clashingVideoIds.includes(video.
                      contentDetails.videoId));

              // // If no new videos were found, break the loop
              if (newVideos.length === 0) {
                console.debug(`youtube: No new videos found for ${
                  channelSlug}`);
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
                    `youtube: ${newVideos.length} new videos found for: ${channelSlug}`
                );
                break;
              }

              // If all videos are new, continue to the next page
              if (newVideos.length === newEpisodes.length) {
                console.debug(
                    `youtube: All new videos found: ${
                      channelSlug}, scraping again`
                );
              }
            }

            // If no next page token, break the loop
            if (!response.data.nextPageToken) {
              console.debug(`youtube: No next page token for ${
                channelSlug}`);
              break;
            }
          }
        }
        if (videoBuffer.length === 0) {
          throw new Error(`youtube: No videos found for ${channelSlug}`);
        }


        // Remove undefined videos
        videoBuffer.filter((video:any) => video !== undefined ||
        video !== null);


        const convertedVideos = videoBuffer.map(
            (video: any): YoutubeVideo => {
              return {
                youtubeVideoId: video.contentDetails.videoId,
                publishedAt: new Date(video.contentDetails.videoPublishedAt),
                playlistId: video.snippet.playlistId,
                channelTitle: video.snippet.channelTitle,
                title: video.snippet.title,
                channelId: video.snippet.channelId,
                etag: video.etag,
                status: video.status.privacyStatus,
                channelSlug: channelSlug,
              };
            }
        );
        console.debug(
            `nebula: Found ${convertedVideos.length} Nebula videos for ${
              channelSlug} with a limit of ${videoScrapeLimit}`
        );

        // Add the videos to the database
        const batch = admin.firestore().batch();
        const channelRef = admin.firestore()
            .collection("channels").doc(channelSlug);

        // Add videos to channel collections
        convertedVideos.forEach(async (video: any) => {
          const videoRef = channelRef.
              collection("youtubeVideos").doc(video.youtubeVideoId);
          batch.create(videoRef, video);
        });

        batch.set(channelRef, {
          lastScrapedYoutube: new Date(),
        });

        await batch.commit();
        console.debug(`youtube: Added ${
          convertedVideos.length} videos to ${
          channelSlug}`);

        res.send(`Scraped ${convertedVideos.
            length} videos for ${channelSlug}`);
        return;
      } catch (error) {
        if (!res.headersSent) {
          res.status(400).send(error);
          return;
        }
        return;
      }
    });


export default youtubeScrape;
