import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {v4: uuidv4} = require("uuid");

  // Generate lookup table
  interface LookupTable {
  channels: ChannelEntry[];
  generatedAt: Date;
  id: string;
}

interface ChannelEntry {
  matched: string[];
  not_matched: string[];
  slug: string;
}

const generateTable = functions.https.onRequest(async () => {
  // Get all channels
  const channelRef = admin.firestore().collection("channels");
  const channels = await (await admin.firestore().collection("channels"))
      .get();
  console.log(channels);

  const channelEntries = [];
  for (const channel of channels.docs) {
    const channelData = channel.data();
    console.log(`table: Processing ${channelData.slug}`);

    // Get Nebula Videos
    const nebulaVideosRef = channelRef.doc(channelData.slug).
        collection("nebulaVideos");
    const matchedNebulaVideos = await nebulaVideosRef.
        where("matched", "==", true).get();
    const matchedNebulaVideosArray = matchedNebulaVideos.docs.map(
        (doc) => doc.data());
    console.log(`nebula table: ${channelData.slug} 
    matched: ${matchedNebulaVideosArray.length}`);

    // Get Youtube Videos
    const youtubeVideosRef = channelRef.doc(channelData.slug).
        collection("youtubeVideos");
    const youtubeVideos = await youtubeVideosRef.get();
    const youtubeVideosArray = youtubeVideos.docs.
        map((doc) => doc.data());


    // Get the unmatched youtube videos
    const unmatchedYoutubeVideos = youtubeVideosArray.filter(
        (youtubeVideo) => {
          return !matchedNebulaVideosArray.some(
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
      matched: matchedNebulaVideosArray.map(
          (nebulaVideo) => {
            return nebulaVideo.youtubeVideoId;
          }
      ),
      not_matched: unmatchedYoutubeVideos.map(
          (youtubeVideo) => {
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
}
);
export default generateTable;
