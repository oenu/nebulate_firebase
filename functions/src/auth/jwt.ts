import axios from "axios";

import getKey from "./key";
import * as admin from "firebase-admin";

// Request JWT from nebula api
const getJWT = (async () => {
  // Check if key exists
  const key = await admin.firestore().collection("secrets").doc("key")
      .get();
  if (!key.data()?.value) {
    // Trigger key function
    await getKey();
  }

  const doc = await admin.firestore().collection("secrets").doc("key").get();
  if (doc.exists) {
    const key = doc.data()?.key;
    const url = "https://api.watchnebula.com/api/v1/authorization/";
    const response = await axios.post(url, {
      data: {Authorization: `Token ${key}`},
    });
    console.debug("jwt: JWT fetched from Nebula");

    // Save JWT to firestore
    await admin.firestore().collection("secrets").doc("jwt")
        .set({value: response.data.token});
    return response.data.token;
  } else {
    throw new Error("jwt: Unable to get JWT from Nebula");
  }
}
);

export default getJWT;
