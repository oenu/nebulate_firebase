import * as admin from "firebase-admin";
import * as jwt from "jsonwebtoken";
import getJWT from "./jwt";
import getKey from "./key";


const getAuth = (async () => {
  // Check if the key is undefined, if so, get a new one
  const key = await (await admin.firestore().collection("secrets").doc("key")
      .get()).data()?.value;
  if (key === undefined) {
    console.debug("auth: Key undefined, fetching from Nebula");
    await getKey();
  }

  // Get the token from the store
  let token = await (await admin.firestore().collection("secrets").doc("jwt")
      .get()).data()?.value;
  if (token === undefined) {
    console.debug("auth: Token undefined, fetching from Nebula");
    token = await getJWT();
  }
  let decode = jwt.decode(token) as jwt.JwtPayload;

  // Check if the token is invalid, if so, get a new token
  if (decode === null) {
    console.debug("auth: Token Missing, Fetching");
    await getJWT();
    decode = jwt.decode(token) as jwt.JwtPayload;
  }

  // Check if the token is still invalid, if so, send an error
  if (decode === undefined) {
    throw new Error("auth: Token Invalid");
  }

  // Check if the token has an expiry, if not, send an error
  if (!decode.exp) {
    throw new Error("auth: Token Without Expiration");
  } else {
    // Check if the token is about to expire, if so, get a new token
    if (decode.exp < Date.now() / 1000 + 60) {
      console.debug("auth: Token Expired - Fetching New Token");
      await getJWT();
    }

    // Check if the issuer is invalid, if so, reject the token
    if (decode.iss !== "api.watchnebula.com") {
      throw new Error("auth: Token Issuer Invalid");
    }

    // Token has passed all checks, continue
    return {token, decode};
  }
});

export default getAuth;
