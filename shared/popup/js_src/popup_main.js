import { authorAlias } from "./aliasing.js";
import { getTagsFromPreset } from "./tag_presets.js";
import { getPotentialRepost, IMAGES_URL } from "./repost_check.js";

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
 * @param {Number} idx Current index
 * @param {Number} length Total number of images.
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
 * Remove the pop-up main image display.
 */
function clearImgDisplay() {
  const elem = document.getElementById("thumb-container");
  while (elem.firstChild) {
    elem.removeChild(elem.firstChild);
  }
}

/**
 * set the pop-up's resolution field.
 * @param {number} width Image width.
 * @param {number} height Image height.
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
  console.error("Encountered a promise error:", e);
}

/**
 * Given the handler response, set any warnings which need to be set.
 */
function dispatchWarnings(resp, promiseMetaProp) {
  clearWarnings();
  let ok = true;
  if (resp.listenerType == "universal") {
    addTextWarning(
      "Universal Extractor",
      "Some info may be missing or incorrect."
    );
    ok = false;
  }

  let hasRes = false;
  resp.expectedResolutions.forEach((resObj) => {
    hasRes =
      resp.images[promiseMetaProp.currentImgIdx].width === resObj.width &&
      resp.images[promiseMetaProp.currentImgIdx].height === resObj.height;
  });
  if (resp.listenerType == "deviantart" && !hasRes) {
    addTextWarning(
      "DeviantArt",
      "Not extracting the expected resolution. " +
        "DeviantArt may hide hi-res files behind " +
        "a download button. "
    );
    ok = false;
  }
  getPotentialRepost(getActiveImage(promiseMetaProp).fetchSrc)
    .then((maybeRepost) => {
      if (maybeRepost !== null) {
        addRepostWarning("Repost Detected", `${maybeRepost.id}`);
      } else if (ok) {
        clearWarnings();
      }
      return Promise.resolve();
    })
    .catch((error) => {
      console.error("Encountered an error looking up repost:", error);
    });
}

/**
 * Add a generic warning.
 * @param header Warning header. String.
 * @param node HTML Node, contents to fill the body.
 */
function addWarning(header, node) {
  const warnHeaderElem = document.createElement("p");
  warnHeaderElem.setAttribute("class", "warning-container-header");
  const warnHeaderText = document.createTextNode(header);
  warnHeaderElem.appendChild(warnHeaderText);

  const group = document.createElement("div");
  group.appendChild(warnHeaderElem);
  group.appendChild(node);
  const warnElemContainer = document.getElementById("warning-container");
  warnElemContainer.appendChild(group);
}

function addTextWarning(header, body) {
  const warnBodyElem = document.createElement("p");
  warnBodyElem.setAttribute("class", "warning-container-body");
  warnBodyElem.appendChild(document.createTextNode(body));
  addWarning(header, warnBodyElem);
}

function addRepostWarning(header, imageId) {
  const warnBodyElem = document.createElement("a");
  warnBodyElem.setAttribute("href", IMAGES_URL + imageId.toString());
  warnBodyElem.setAttribute("target", "_blank");
  warnBodyElem.setAttribute(
    "class",
    "warning-container-url warning-container-body"
  );
  warnBodyElem.appendChild(document.createTextNode(`ID# ${imageId}`));
  addWarning(header, warnBodyElem);
}

/**
 * Remove all warnings in the warning container.
 */
function clearWarnings() {
  const warnElemHeader = document.getElementById("warning-container");
  const children = warnElemHeader.childNodes;
  children.forEach((x) => warnElemHeader.removeChild(x));
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
 * Update everything about the postDataProp based on the promiseMetaProp,
 * in the event that promiseMetaProp changes.
 */
function updatePostDataPropFromMeta(postDataProp, promiseMetaProp) {
  resetNextPrev(promiseMetaProp.currentImgIdx, promiseMetaProp.imgItems.length);
  const selectedImg = getActiveImage(promiseMetaProp);
  if (promiseMetaProp.fetchType === DIRECT_FETCH_TYPE) {
    displayRes(selectedImg.width, selectedImg.height);
  } else {
    displayUnknownRes();
  }
  postDataProp.fetchURLStr = selectedImg.fetchSrc;
  updateImageDisplay(selectedImg);
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
    promiseMetaProp.manualIdx = true;
    if (
      promiseMetaProp.imgItems.length > 0 &&
      promiseMetaProp.currentImgIdx < promiseMetaProp.imgItems.length - 1
    ) {
      promiseMetaProp.currentImgIdx++;
      resetNextPrev(
        promiseMetaProp.currentImgIdx,
        promiseMetaProp.imgItems.length
      );
      updatePostDataPropFromMeta(postDataProp, promiseMetaProp);
    }
  });
  PREV_IMAGE_BUTTON.addEventListener("click", () => {
    promiseMetaProp.manualIdx = true;
    if (promiseMetaProp.imgItems && promiseMetaProp.currentImgIdx > 0) {
      promiseMetaProp.currentImgIdx--;
      resetNextPrev(
        promiseMetaProp.currentImgIdx,
        promiseMetaProp.imgItems.length
      );
      updatePostDataPropFromMeta(postDataProp, promiseMetaProp);
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
  promiseMetaProp.imgItems = [];
  promiseMetaProp.currentImgIdx = 0;
  clearImgDisplay();
  resetNextPrev(0, 0);
  clearRes();
}

/*
 * Reload the popup display content.
 */
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
          // If we've been pressing the image selector buttons, we
          // should keep the current index.
          const expectedIdx = promiseMetaProp.manualIdx
            ? promiseMetaProp.currentImgIdx
            : resp.expectedIdx;
          promiseMetaProp.imgItems = resp.images;
          if (expectedIdx >= promiseMetaProp.imgItems.length) {
            return Promise.reject({
              isError: true,
              message: `expectedIdx ${expectedIdx} greater than num images`,
            });
          }
          promiseMetaProp.currentImgIdx = expectedIdx;

          // Handle post authors/artists ------------------------------
          if (resp.authors.length > 0) {
            if (resp.listenerType) {
              resp.authors.forEach((author) => {
                postDataProp.tags.push(
                  "artist:" + authorAlias(resp.listenerType, author)
                );
              });
            } else {
              resp.authors.forEach((author) => {
                postDataProp.tags.push("artist:" + author);
              });
            }
          }
          // Handle post extracted data -------------------------------
          if (resp.extractedTags) {
            postDataProp.tags = postDataProp.tags.concat(resp.extractedTags);
          }
          postDataProp.description = resp.description;
          postDataProp.sourceURLStr = resp.sourceLink;
          postDataProp.autoquote = resp.autoquote;

          if (promiseMetaProp.imgItems.length > 0) {
            // We extracted some images! Update the display and what to
            // post.
            updatePostDataPropFromMeta(postDataProp, promiseMetaProp);
            dispatchWarnings(resp, promiseMetaProp);
            return Promise.resolve({ isError: false });
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

/**
 * @param {.imgItems} promiseMetaProp
 * @returns The current image object.
 */
function getActiveImage(promiseMetaProp) {
  return promiseMetaProp.imgItems[promiseMetaProp.currentImgIdx];
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
    currentImgIdx: 0,
    imgItems: [],
    fetchType: DIRECT_FETCH_TYPE,
    tagPreset: [],
    manualIdx: false,
  };

  // Set up buttons. -----------------------------------------------------------
  generalButtonSetup(promiseMetaProp, postDataProp);
  processPopUpForm(promiseMetaProp);
  resetPopUp(promiseMetaProp, postDataProp);
}
document.addEventListener("DOMContentLoaded", main);
