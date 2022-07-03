import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {NebulaVideo, YoutubeVideo} from "../types";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {v4: uuidv4} = require("uuid");

  // Generate lookup table
  interface LookupTable {
  channels: ChannelEntry[];
  generatedAt: Date;
  id: string;
}

interface ChannelEntry {
  matched: (string | undefined)[] ;
  not_matched: string[];
  slug: string;
}

// TODO: If table is same as last, dont update in file

const generateTable = functions.https.onRequest(async (
    req: functions.Request, res: functions.Response) => {
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

  // Get all channels
  const channels = await (await admin.firestore().collection("channels"))
      .get();
  console.log(channels);

  const channelEntries = [];
  for (const channel of channels.docs) {
    const channelData = channel.data();
    console.log(channelData.nebulaVideos[0]);
    console.log(channelData.youtubeVideos[0]);
    console.log(`table: Processing ${channelData.slug}`);

    // Get Nebula Videos

    const matchedNebulaVideos: NebulaVideo[] = channelData.
        nebulaVideos.filter(
            (nebulaVideo: NebulaVideo) => {
              return nebulaVideo.youtubeVideoId;
            });
    // matchedNebulaVideos.filter((x) => x !== undefined);

    console.log(`nebula table: ${channelData.slug} 
    matched: ${matchedNebulaVideos.length}`);

    // Get Youtube Videos
    const youtubeVideosArray = channel.data().youtubeVideos;


    // Get the unmatched youtube videos
    const unmatchedYoutubeVideos = youtubeVideosArray.filter(
        (youtubeVideo: YoutubeVideo) => {
          return !matchedNebulaVideos.some(
              (nebulaVideo) => {
                return youtubeVideo.youtubeVideoId ===
                     nebulaVideo.youtubeVideoId;
              }
          );
        }
    );
    console.log(`youtube table: ${channelData.slug}
    unmatched: ${unmatchedYoutubeVideos.length}`);
    // Create Channel Entry
    const channelEntry: ChannelEntry = {
      matched: matchedNebulaVideos.map(
          (nebulaVideo) => {
            return nebulaVideo.youtubeVideoId;
          }
      ),
      not_matched: unmatchedYoutubeVideos.map(
          (youtubeVideo: YoutubeVideo) => {
            return youtubeVideo.youtubeVideoId;
          }
      ),
      slug: channelData.slug,
    };
    channelEntries.push(channelEntry);
  }

  // Create Lookup Table
  const lookupTable: LookupTable = {
    channels: channelEntries,
    generatedAt: new Date(),
    id: uuidv4(),
  };

  // Store Lookup Table
  const lookupTableRef = admin.firestore().collection("lookupTables");
  await lookupTableRef.doc(lookupTable.id).create(lookupTable);
  console.log("table: Lookup table generated");
  res.status(200).send("table: Lookup table generated");
  return;
}
);
export default generateTable;
