import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import {youtube} from "@googleapis/youtube";
const yt = youtube("v3");


// Types
import type {Channel} from "../types";

// Functions
import getAuth from "../auth/auth";

// Data
import {youtubeIds} from "../channelMap";

const register = functions.https.onRequest(
    async (req: functions.Request, res: functions.Response) => {
      try {
        const channelSlug = req.body.channelSlug;

        // Check if channelSlug is undefined
        if (channelSlug === undefined) {
          res.status(400).send("channelSlug is undefined");
          return;
        }

        // Check if channel is already registered
        const channelDoc = await admin.firestore().collection("channels")
            .doc(channelSlug).get();
        if (channelDoc.exists) {
          res.status(400).send("Channel already registered");
          return;
        }

        // Get auth token
        const {token} = await getAuth();

        // Request channel data from nebula api
        let nebulaResponse;
        try {
          const url = `https://content.watchnebula.com/video/channels/${channelSlug}/`;
          nebulaResponse = await axios.get(url, {
            data: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (error) {
          res.status(400).send("Channel not found");
          return;
        }

        // Format data from Nebula response
        const {id, slug, title, description, type} = nebulaResponse.
            data.details;
        const zypeId = nebulaResponse.data.details.zype_id;


        // Get youtube id from youtubeIds
        const youtubeId = youtubeIds.
            find((channel) => channel.slug === channelSlug)?.youtube_id;
        if (youtubeId === undefined || youtubeId === null) {
          res.status(400).send("Channel not found");
          return;
        }

        // Request channel data from youtube api
        const youtubeResponse = (await yt.channels.list({
          id: [youtubeId],
          auth: process.env.YOUTUBE_API_KEY as string,
          part: ["contentDetails", "snippet"],
        }))?.data?.items;
        const youtubeData = youtubeResponse?.at(0);
        console.log(youtubeData);
        // if (!youtubeData?.contentDetails) {
        //   res.status(400).send("Channel not found");
        //   throw new Error(
        //       "register: Could not get creator from youtube API"
        //   );
        //   return;
        // }
        if (youtubeData?.contentDetails?.
            relatedPlaylists?.uploads === undefined) {
          res.status(400).send("Upload playlist not found");
          return;
        }

        // Create channel
        const channel: Channel = {
          nebulaId: id,
          slug,
          title,
          description,
          type,
          zypeId,
          youtubeId,
          youtubeChannelName: youtubeData?.snippet?.title as string,
          uploadPlaylistId: youtubeData?.contentDetails?.
              relatedPlaylists?.uploads as string,
        };

        // Register channel in firestore
        await admin.firestore().collection("channels").doc(channelSlug)
            .set({channel});
        res.status(200).send("Channel registered");
        return;
      } catch (error) {
        console.error(error);
        if (!res.headersSent)res.status(500).send(error);
        return;
      }
    });

export default register;
