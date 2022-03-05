import toastr from "toastr";
import { NotelixChromeStorageKey } from "../popup/consts";
import { get } from "lodash";
import { sendChromeCommandToEveryTab } from "../utils/chromeCommand";
import { COMMAND_REFRESH_ANNOTATIONS } from "../consts";
import { clientSideEncryptionEnabled } from "../encryption";

export async function getEndpoint(
  path,
  { involvesClientSideEncryption = false } = {
    involvesClientSideEncryption: false,
  }
) {
  if (involvesClientSideEncryption) {
    const enabled = await clientSideEncryptionEnabled();
    if (enabled) {
      return new Promise((resolve) => {
        resolve(`http://127.0.0.1:18565/${path}`);
      });
    }
  }

  return new Promise((resolve) => {
    getServer().then((server) => {
      resolve(`${server.replace(/\/$/, "")}/${path}`);
    });
  });
}

export const getHeaders = (requireLoggedIn = false) => {
  if (window.notelixSaasConfig) {
    return Promise.resolve({
      Authorization: `guest-token ${window.notelixSaasConfig.guestToken}`,
    });
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
      const headers = {};
      value[NotelixChromeStorageKey] = value[NotelixChromeStorageKey] || {};
      if (value[NotelixChromeStorageKey].notelixUser) {
        headers["Authorization"] =
          "jwt " + value[NotelixChromeStorageKey].notelixUser.jwt;
      } else {
        if (requireLoggedIn) {
          toastr.warning(
            `notelix: Please login first, by clicking on the Notelix extension in the top-right corner of the Chrome window`
          );
          throw "not logged in";
        }
      }
      resolve(headers);
    });
  });
};

export function getServer() {
  return new Promise((resolve) => {
    if (window.notelixSaasConfig) {
      resolve(window.notelixSaasConfig.server);
      return;
    }
    chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
      resolve(value[NotelixChromeStorageKey].notelixServer);
    });
  });
}

export function onRequestError(err) {
  setTimeout(() => {
    if (err.toString() === "Error: Extension context invalidated.") {
      toastr.warning(
        `notelix: Please refresh the page before using this plugin`
      );
    } else {
      if (get(err, "response.data.clearClientCredentials")) {
        toastr.error(`notelix: login expired, please login again`);

        chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
          delete value[NotelixChromeStorageKey].notelixUser;
          delete value[NotelixChromeStorageKey].notelixPassword;
          chrome.storage.sync.set(value, () => {
            sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
          });
        });
      } else {
        toastr.error(`notelix: ${err.toString()}`);
      }
    }
  });
  throw err;
}

export function wrapRequestApi(callback, requireLoggedIn = false) {
  return getHeaders(requireLoggedIn)
    .then((headers) => callback({ headers }))
    .catch(onRequestError);
}

export function wrapRequestApiRequireLoggedIn(callback) {
  return wrapRequestApi(callback, true);
}
