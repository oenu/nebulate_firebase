import * as admin from "firebase-admin";
admin.initializeApp();
import axios from "axios";

// Request secret from Nebula Api
const getKey = (async () => {
  if (
    process.env.NEBULA_USERNAME === undefined ||
    process.env.NEBULA_PASSWORD === undefined
  ) {
    throw new Error("key: Environment variables not set");
  }

  try {
    // Request secret from Nebula
    const response = await axios.post(
        "https://api.watchnebula.com/api/v1/auth/login/",
        {
          email: process.env.NEBULA_USERNAME,
          password: process.env.NEBULA_PASSWORD,
        }
    );
    console.debug("key: Key fetched from Nebula");

    // Write secret to file
    await admin.firestore().collection("secrets").doc("key").set({
      value: response.data.key,
    });
    return response.data.key;
  } catch (error) {
    throw new Error("key: Unable to get key from Nebula");
  }
});

export default getKey;
