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

exports.register = functions.https.onRequest(
    async (req: functions.Request, res: functions.Response) => {
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
      // eslint-disable-next-line max-len
      const {id, slug, title, description, type, zypeId} = nebulaResponse.data.details;

      // Get youtube id from youtubeIds
      // eslint-disable-next-line max-len
      const youtubeId = youtubeIds.find((channel) => channel.slug === channelSlug)?.youtube_id;
      if (youtubeId === undefined || youtubeId === null) {
        res.status(400).send("Channel not found");
        return;
      }

      // Request channel data from youtube api
      const youtubeResponse = (await yt.channels.list({
        id: [youtubeId],
        auth: process.env.YOUTUBE_API_KEY as string,
        part: ["contentDetails"],
      }))?.data?.items;
      if (youtubeResponse === undefined || youtubeResponse === null) {
        res.status(400).send("Channel not found");
        return;
      }
      const youtubeData = youtubeResponse[0];
      if (!youtubeData ||
         !youtubeData?.contentDetails?.
             relatedPlaylists?.uploads ||
          youtubeData?.snippet?.title === undefined) {
        res.status(400).send("Channel not found");
        throw new Error(
            "register: Could not get upload playlist id from youtube API"
        );
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
        uploadPlaylistId: youtubeData.contentDetails.relatedPlaylists.uploads,
      };

      // Register channel in firestore
      await admin.firestore().collection("channels").doc(channelSlug)
          .set(channel);
      res.status(200).send("Channel registered");
    });
