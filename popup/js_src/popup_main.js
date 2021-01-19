import { authorAlias } from "./aliasing.js";
import { getTagsFromPreset } from "./tag_presets.js";

const SUBMISSION_URL = "https://furbooru.org/images/new";
const POST_FIRST_ELEMENT = document.getElementById("post-first");
const NEXT_IMAGE_BUTTON = document.getElementById("next-image-button");
const PREV_IMAGE_BUTTON = document.getElementById("prev-image-button");
const RESOLUTION_ELEM = document.getElementById("resolution");

const DIRECT_FETCH_TYPE = "direct";
const GENERAL_FETCH_TYPE = "general";

async function extractData(tabId, data) {
  return browser.tabs.sendMessage(tabId, {
    command: "contentExtractData",
    data: data,
  });
}

function displayURL(urlStr) {
  const urlObj = new URL(urlStr);
  const elem = document.getElementById("site-detector-container");
  elem.textContent = "";
  elem.appendChild(document.createTextNode(urlObj.host));
}

/**
 * Enable/disable the previous and next buttons.
 */
function resetNextPrev(idx, length) {
  if (idx === 0) {
    PREV_IMAGE_BUTTON.disabled = true;
  } else {
    PREV_IMAGE_BUTTON.disabled = false;
  }
  if (idx >= length - 1) {
    NEXT_IMAGE_BUTTON.disabled = true;
  } else {
    NEXT_IMAGE_BUTTON.disabled = false;
  }
}

function displaySelectedImg(imgItem) {
  const img = new Image();
  img.src = imgItem.src;
  clearImgDisplay();
  const elem = document.getElementById("thumb-container");
  elem.appendChild(img);
}

/**
 *  Remove the pop-up main image display.
 */
function clearImgDisplay() {
  const elem = document.getElementById("thumb-container");
  while (elem.firstChild) {
    elem.removeChild(elem.firstChild);
  }
}

/**
 *  set the pop-up's resolution field.
 */
function displayRes(width, height) {
  RESOLUTION_ELEM.textContent = `${width}px \u00D7 ${height}px`;
}

function displayUnknownRes() {
  RESOLUTION_ELEM.textContent = "???px \u00D7 ???px";
}

function updateImageDisplay(imgItem) {
  displaySelectedImg(imgItem);
  if (imgItem.lazyLoad || imgItem.width === null || imgItem.height === null) {
    displayUnknownRes();
  } else {
    displayRes(imgItem.width, imgItem.height);
  }
}

function clearRes() {
  RESOLUTION_ELEM.textContent = "";
}

/**
 * Handle any promise errors.
 */
function handleError(e) {
  console.error(e);
}

/**
 * Given the handler response, set any warnings which need to be set.
 */
function dispatchWarnings(resp) {
  if (resp.listenerType == "universal") {
    setWarning(
      "Using Universal Extractor",
      "Some info may be missing or incorrect.");
    return;
  }
  if (resp.listenerType == "deviantart") {
    setWarning(
      "DeviantArt Warning",
      "DeviantArt sometimes hides high-res file behind "
      + "a download button. "
      + "FurAdder may not be extracting the highest resolution."
    );
    return;
  }
  clearWarning();
}

/**
 *
 */
function setWarning(header, body) {
  const warnElemHeader = document.getElementById("warning-container-header");
  warnElemHeader.textContent = "\u26a0 " + header + " \u26a0";
  const warnElemBody = document.getElementById("warning-container-body");
  warnElemBody.textContent = body;
}

/**
 *
 */
function clearWarning() {
  const warnElem = document.getElementById("warning-container");
  warnElem.textContent = "";
}

/**
 *  Set properties based on the pop-up's form entry.
 *  @param promiseMetaProp Object reference to edit the properties of.
 */
function processPopUpForm(promiseMetaProp) {
  if (document.getElementById("furbooru-fetch-input").checked) {
    promiseMetaProp.fetchType = GENERAL_FETCH_TYPE;
  } else {
    promiseMetaProp.fetchType = DIRECT_FETCH_TYPE;
  }
  const setTags = getTagsFromPreset(
    document.getElementById("tag-presets").value
  );
  if (setTags == null) {
    console.error("Tag Preset failed to load: ", setTags);
    return;
  }
  const ratingTag = document.getElementById("ratings").value;
  promiseMetaProp.tagPreset = [...setTags, ratingTag];
}

/**
 * Send a submission request to the background code.
 *
 * @param postDataProp Property which holds extracted data from the source.
 * @param promiseMetaProp Property which holds meta-data, usually form info.
 * @post Sends out a message to the background extension code.
 */
function submit(postDataProp, promiseMetaProp) {
  const submissionData = {
    ...postDataProp,
  };
  const lowerTags = postDataProp.tags
    .concat(promiseMetaProp.tagPreset)
    .map((x) => x.toLowerCase());
  const uniqueTags = [...new Set(lowerTags)];
  submissionData.tags = uniqueTags;
  const request = {
    command: "createSubmissionTab",
    data: {
      urlStr: SUBMISSION_URL,
      postData: submissionData,
    },
  };
  browser.runtime.sendMessage(request);
}

/**
 * Set up form buttons to bind to message sending functions and property
 * updates.
 */
function generalButtonSetup(promiseMetaProp, postDataProp) {
  POST_FIRST_ELEMENT.addEventListener("click", () => {
    submit(postDataProp, promiseMetaProp);
  });
  NEXT_IMAGE_BUTTON.addEventListener("click", () => {
    if (
      promiseMetaProp.imgItems &&
      promiseMetaProp.currentImgIdx < promiseMetaProp.imgItems.length - 1
    ) {
      if (promiseMetaProp.currentImgIdx !== null) {
        promiseMetaProp.currentImgIdx++;
        resetNextPrev(
          promiseMetaProp.currentImgIdx,
          promiseMetaProp.imgItems.length
        );
      }
      const selectedImg =
        promiseMetaProp.imgItems[promiseMetaProp.currentImgIdx];
      updateImageDisplay(selectedImg);
    }
  });
  PREV_IMAGE_BUTTON.addEventListener("click", () => {
    if (promiseMetaProp.imgItems && promiseMetaProp.currentImgIdx > 0) {
      if (promiseMetaProp.currentImgIdx !== null) {
        promiseMetaProp.currentImgIdx--;
        resetNextPrev(
          promiseMetaProp.currentImgIdx,
          promiseMetaProp.imgItems.length
        );
      }
      const selectedImg =
        promiseMetaProp.imgItems[promiseMetaProp.currentImgIdx];
      updateImageDisplay(selectedImg);
    }
  });

  document
    .getElementById("furbooru-fetch-input")
    .addEventListener("change", () => {
      processPopUpForm(promiseMetaProp);
      resetPopUp(promiseMetaProp, postDataProp);
    });
  document.getElementById("tag-presets").addEventListener("change", () => {
    processPopUpForm(promiseMetaProp);
  });
  document.getElementById("ratings").addEventListener("change", () => {
    processPopUpForm(promiseMetaProp);
  });
}

/**
 * Handle cleanup from a failed extraction.
 */
function failureCleanup(promiseMetaProp, _) {
  promiseMetaProp.imgItems = null;
  promiseMetaProp.currentImgIdx = null;
  clearImgDisplay();
  resetNextPrev(0, 0);
  clearRes();
}

function resetPopUp(promiseMetaProp, postDataProp) {
  // Display current page content. ---------------------------------------------
  const tabsCurrent = browser.tabs.query({ active: true, currentWindow: true });
  tabsCurrent
    .then((tabs) => {
      const curTab = tabs[0];
      // Display the URL
      displayURL(curTab.url);

      // Extract the tab data and enable buttons.
      const requestData = {
        urlStr: curTab.url,
        fetchType: promiseMetaProp.fetchType,
      };
      extractData(curTab.id, requestData)
        .then((resp) => {
          const expectedIdx = resp.expectedIdx !== null ? resp.expectedIdx : 0;
          promiseMetaProp.currentImgIdx = expectedIdx;
          promiseMetaProp.imgItems = resp.images;
          if (expectedIdx >= promiseMetaProp.imgItems.length) {
            return Promise.reject({
              isError: true,
              message: `expectedIdx ${expectedIdx} greater than num images`,
            });
          }
          if (resp.author != null && resp.author != "") {
            if (resp.listenerType) {
              postDataProp.tags.push(
                "artist:" + authorAlias(resp.listenerType, resp.author)
              );
            } else {
              postDataProp.tags.push("artist:" + resp.author);
            }
          }
          if (resp.extractedTags) {
            postDataProp.tags = postDataProp.tags.concat(resp.extractedTags);
          }
          postDataProp.description = resp.description;
          postDataProp.sourceURLStr = resp.sourceLink;

          if (
            promiseMetaProp.imgItems &&
            promiseMetaProp.currentImgIdx !== null
          ) {
            // We've successfully loaded images!
            resetNextPrev(
              promiseMetaProp.currentImgIdx,
              promiseMetaProp.imgItems.length
            );
            const selectedImg =
              promiseMetaProp.imgItems[promiseMetaProp.currentImgIdx];
            if (promiseMetaProp.fetchType === DIRECT_FETCH_TYPE) {
              displayRes(selectedImg.width, selectedImg.height);
            } else {
              displayUnknownRes();
            }
            postDataProp.fetchURLStr = selectedImg.fetchSrc;
            updateImageDisplay(selectedImg);
            dispatchWarnings(resp);
            return Promise.resolve(selectedImg);
          }

          // Clean up if images did not load.
          return Promise.reject({
            isError: true,
            message: "Failed to load images",
          });
        })
        .catch((e) => {
          handleError(e);
          failureCleanup(promiseMetaProp, postDataProp);
        });
    })
    .catch(handleError);
}

function main() {
  // Create references to passed around properties. While they aren't global,
  // We do use them in callback captures.
  const postDataProp = {
    fetchURLStr: "",
    sourceURLStr: "",
    description: "",
    tags: [],
  };
  const promiseMetaProp = {
    currentImgIdx: null,
    imgItems: null,
    fetchType: DIRECT_FETCH_TYPE,
    tagPreset: [],
  };

  // Set up buttons. -----------------------------------------------------------
  generalButtonSetup(promiseMetaProp, postDataProp);
  processPopUpForm(promiseMetaProp);
  resetPopUp(promiseMetaProp, postDataProp);
}
document.addEventListener("DOMContentLoaded", main);
