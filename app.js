const KEY = "next-feed-v3";

const defaults = {
  basis: "finish",
  min: 2.5,
  max: 3,
  goal: 8,

  // Initial estimate before we have real data.
  initialReadyMinutes: 15,

  // Completed feeding sessions.
  feeds: [],

  // Current get-ready or feeding session.
  active: null
};

let state = load();

const $ = id => document.getElementById(id);


/* =========================
   STORAGE
========================= */

function load() {

  try {

    const saved =
      JSON.parse(
        localStorage.getItem(KEY) || "{}"
      );

    return {
      ...defaults,
      ...saved
    };

  } catch {

    return {
      ...defaults
    };

  }

}


function save() {

  localStorage.setItem(
    KEY,
    JSON.stringify(state)
  );

}


/* =========================
   TIME HELPERS
========================= */

function mins(value) {

  return value * 60 * 1000;

}


function fmtTime(timestamp) {

  return new Date(timestamp)
    .toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });

}


function fmtDate(timestamp) {

  return new Date(timestamp)
    .toLocaleDateString([], {
      month: "short",
      day: "numeric"
    });

}


function durationText(milliseconds) {

  const totalSeconds =
    Math.max(
      0,
      Math.round(milliseconds / 1000)
    );

  const hours =
    Math.floor(totalSeconds / 3600);

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const seconds =
    totalSeconds % 60;


  if (hours > 0) {

    return `${hours}h ${minutes}m`;

  }


  if (minutes > 0) {

    return `${minutes}m ${seconds}s`;

  }


  return `${seconds}s`;

}


/* =========================
   ROLLING 24-HOUR FEEDS
========================= */

function feedsLast24Hours() {

  const cutoff =
    Date.now() - (24 * 60 * 60 * 1000);

  return state.feeds.filter(
    feed => feed.finish >= cutoff
  );

}


/* =========================
   GET-READY AVERAGE
========================= */

function completedReadySessions() {

  return state.feeds.filter(
    feed =>
      feed.readyStart &&
      feed.feedingStart &&
      feed.readyDuration > 0
  );

}


function getReadyAverage() {

  const sessions =
    completedReadySessions();


  if (!sessions.length) {

    return state.initialReadyMinutes;

  }


  const total =
    sessions.reduce(
      (sum, feed) =>
        sum + feed.readyDuration,
      0
    );


  return (
    total /
    sessions.length /
    60000
  );

}


function getReadyAverageText() {

  const average =
    getReadyAverage();


  if (average < 1) {

    return "<1 min";

  }


  const rounded =
    Math.round(average);

  return `${rounded} min`;

}


/* =========================
   NEXT FEED CALCULATION
========================= */

function nextEatingWindow() {

  if (!state.feeds.length) {

    return null;

  }


  const lastFeed =
    state.feeds[
      state.feeds.length - 1
    ];


  const base =
    state.basis === "finish"
      ? lastFeed.finish
      : lastFeed.feedingStart;


  return {

    lo:
      base +
      mins(state.min),

    hi:
      base +
      mins(state.max)

  };

}


/*
  We use the EARLIEST target eating time
  to determine when to begin getting ready.

  Example:

  Eating target:
  4:15–4:45

  Average get-ready:
  15 min

  Start getting ready:
  4:00
*/

function nextGetReadyTime() {

  const window =
    nextEatingWindow();


  if (!window) {

    return null;

  }


  const averageMilliseconds =
    getReadyAverage() *
    60000;


  return (
    window.lo -
    averageMilliseconds
  );

}


/* =========================
   SETUP / SETTINGS
========================= */

function setupUI() {

  $("intervalBasis").value =
    state.basis;

  $("minHours").value =
    state.min;

  $("maxHours").value =
    state.max;

  $("dailyGoal").value =
    state.goal;


  $("settingsBasis").value =
    state.basis;

  $("settingsMin").value =
    state.min;

  $("settingsMax").value =
    state.max;

  $("settingsGoal").value =
    state.goal;


  $("goalNumber").textContent =
    state.goal;

}


/* =========================
   MAIN RENDER
========================= */

function render() {

  setupUI();

  renderProgress();

  renderStats();

  renderHistory();


  if (state.active?.mode === "ready") {

    showGetReady();

    return;

  }


  if (state.active?.mode === "feeding") {

    showFeeding();

    return;

  }


  $("getReadyCard")
    .classList
    .add("hidden");

  $("feedingCard")
    .classList
    .add("hidden");

  $("getReadyBtn")
    .classList
    .remove("hidden");

  $("startFeedingBtn")
    .classList
    .add("hidden");

  renderNext();

}


/* =========================
   NEXT FEED DISPLAY
========================= */

function renderNext() {

  const window =
    nextEatingWindow();


  if (!window) {

  $("getReadyTime").textContent =
    "Ready when baby eats";

  $("getReadyCountdown").textContent =
    "Record the first feeding to start your schedule.";

  $("nextWindow").textContent =
    "No previous feeding yet";

  $("lastInfo").textContent =
    "After this feeding ends, the app will calculate the next get-ready time.";

  $("getReadyBtn").textContent =
    "START FIRST FEEDING";

  $("getReadyBtn").disabled = false;

  return;

}


  $("getReadyBtn").disabled =
    false;


  const readyTime =
    nextGetReadyTime();


  $("getReadyTime").textContent =
    fmtTime(readyTime);


  $("nextWindow").textContent =
    `${fmtTime(window.lo)} – ${fmtTime(window.hi)}`;


  const lastFeed =
    state.feeds[
      state.feeds.length - 1
    ];


  $("lastInfo").textContent =
    `Last feeding finished ${fmtTime(
      lastFeed.finish
    )}`;


  updateGetReadyCountdown();

}


/* =========================
   GET-READY COUNTDOWN
========================= */

function updateGetReadyCountdown() {

  const readyTime =
    nextGetReadyTime();


  if (!readyTime) {

    return;

  }


  const now =
    Date.now();


  const difference =
    readyTime - now;


  if (difference > 0) {

    $("getReadyCountdown").textContent =
      `Start getting ready in ${durationText(
        difference
      )}`;

    return;

  }


  const window =
    nextEatingWindow();


  if (
    window &&
    now >= window.lo
  ) {

    $("getReadyCountdown").textContent =
      "Eating window is open";

    return;

  }


  $("getReadyCountdown").textContent =
    `Get ready now · ${durationText(
      Math.abs(difference)
    )} late`;

}


/* =========================
   24-HOUR PROGRESS
========================= */

function renderProgress() {

  const count =
    feedsLast24Hours().length;


  $("feedCount").textContent =
    count;


  $("goalNumber").textContent =
    state.goal;


  const percentage =
    Math.min(
      100,
      (count / state.goal) * 100
    );


  $("progressFill").style.width =
    `${percentage}%`;


  if (count >= state.goal) {

    $("progressStatus").textContent =
      "Minimum reached";

    $("progressMessage").textContent =
      `You've reached your ${state.goal}-feeding minimum in the last 24 hours.`;

  } else {

    const remaining =
      state.goal - count;

    $("progressStatus").textContent =
      "In progress";

    $("progressMessage").textContent =
      `${remaining} more ${
        remaining === 1
          ? "feeding"
          : "feedings"
      } needed to reach your minimum.`;

  }

}


/* =========================
   STATS
========================= */

function renderStats() {

  $("averageReady").textContent =
    getReadyAverageText();


  const sessions =
    completedReadySessions();


  $("readySessionCount").textContent =
    sessions.length
      ? `${sessions.length} timed ${
          sessions.length === 1
            ? "session"
            : "sessions"
        }`
      : "Initial estimate";


  if (!state.feeds.length) {

    $("lastFinished").textContent =
      "—";

    $("lastDuration").textContent =
      "—";

    return;

  }


  const last =
    state.feeds[
      state.feeds.length - 1
    ];


  $("lastFinished").textContent =
    fmtTime(last.finish);


  $("lastDuration").textContent =
    `Feeding lasted ${
      durationText(
        last.finish -
        last.feedingStart
      )
    }`;

}


/* =========================
   GET-READY SESSION
========================= */

function showGetReady() {

  $("getReadyCard")
    .classList
    .remove("hidden");

  $("feedingCard")
    .classList
    .add("hidden");


  $("getReadyBtn")
    .classList
    .add("hidden");


  $("startFeedingBtn")
    .classList
    .add("hidden");


  updateGetReadyElapsed();

}

function startFirstFeeding() {

  if (state.active) {
    return;
  }

  state.active = {

    mode: "feeding",

    readyStart: null,

    readyDuration: null,

    feedingStart: Date.now()

  };

  save();

  render();

}

function startGettingReady() {

  if (state.active) {

    return;

  }


  state.active = {

    mode: "ready",

    readyStart: Date.now(),

    feedingStart: null

  };


  save();

  render();

}


function updateGetReadyElapsed() {

  if (
    !state.active ||
    state.active.mode !== "ready"
  ) {

    return;

  }


  $("getReadyElapsed").textContent =
    durationText(
      Date.now() -
      state.active.readyStart
    );

}


function babyIsReady() {

  if (
    !state.active ||
    state.active.mode !== "ready"
  ) {

    return;

  }


  const feedingStart =
    Date.now();


  const readyDuration =
    feedingStart -
    state.active.readyStart;


  state.active.mode =
    "feeding";


  state.active.feedingStart =
    feedingStart;


  state.active.readyDuration =
    readyDuration;


  save();

  render();

}


/* =========================
   FEEDING SESSION
========================= */

function showFeeding() {

  $("getReadyCard")
    .classList
    .add("hidden");

  $("feedingCard")
    .classList
    .remove("hidden");


  $("getReadyBtn")
    .classList
    .add("hidden");


  $("startFeedingBtn")
    .classList
    .add("hidden");


  updateFeedingElapsed();

}


function updateFeedingElapsed() {

  if (
    !state.active ||
    state.active.mode !== "feeding"
  ) {

    return;

  }


  $("feedingElapsed").textContent =
    durationText(
      Date.now() -
      state.active.feedingStart
    );

}


function finishFeeding() {

  if (
    !state.active ||
    state.active.mode !== "feeding"
  ) {

    return;

  }


  const finish =
    Date.now();


  const feed = {

    feedingStart:
      state.active.feedingStart,

    finish,

    readyStart:
      state.active.readyStart,

    readyDuration:
      state.active.readyDuration

  };


  state.feeds.push(feed);


  state.active =
    null;


  save();

  render();

}


/* =========================
   BUTTONS
========================= */

$("getReadyBtn").onclick = () => {

  if (!state.feeds.length) {

    startFirstFeeding();

  } else {

    startGettingReady();

  }

};


$("babyReadyBtn").onclick = () => {

  babyIsReady();

};


$("finishFeedingBtn").onclick = () => {

  finishFeeding();

};


$("cancelReadyBtn").onclick = () => {

  if (
    !state.active ||
    state.active.mode !== "ready"
  ) {

    return;

  }


  if (
    confirm(
      "Cancel this get-ready session?"
    )
  ) {

    state.active =
      null;

    save();

    render();

  }

};


/* =========================
   SETTINGS
========================= */

$("settingsBtn").onclick = () => {

  $("homeView")
    .classList
    .add("hidden");

  $("settingsView")
    .classList
    .remove("hidden");

};


$("closeSettings").onclick = () => {

  $("settingsView")
    .classList
    .add("hidden");

  $("homeView")
    .classList
    .remove("hidden");

  render();

};


$("settingsBasis").onchange = event => {

  state.basis =
    event.target.value;

  save();

  render();

};


$("settingsMin").onchange = event => {

  state.min =
    Number(event.target.value);


  if (state.min > state.max) {

    state.max =
      state.min;

  }


  save();

  render();

};


$("settingsMax").onchange = event => {

  state.max =
    Number(event.target.value);


  if (state.max < state.min) {

    state.min =
      state.max;

  }


  save();

  render();

};


$("settingsGoal").onchange = event => {

  state.goal =
    Number(event.target.value);

  save();

  render();

};


/* =========================
   INITIAL SETUP
========================= */

$("saveSettings").onclick = () => {

  const min =
    Number(
      $("minHours").value
    );

  const max =
    Number(
      $("maxHours").value
    );


  if (min > max) {

    alert(
      "The minimum interval must be less than or equal to the maximum interval."
    );

    return;

  }


  state.basis =
    $("intervalBasis").value;

  state.min =
    min;

  state.max =
    max;

  state.goal =
    Number(
      $("dailyGoal").value
    );


  save();


  $("setupCard")
    .classList
    .add("hidden");


  render();

};


/* =========================
   RESET
========================= */

$("resetBtn").onclick = () => {

  if (
    confirm(
      "Delete all feeding history and reset the app?"
    )
  ) {

    state = {

      ...defaults,

      feeds: [],

      active: null

    };


    save();

    render();


    $("settingsView")
      .classList
      .add("hidden");

    $("homeView")
      .classList
      .remove("hidden");

  }

};


/* =========================
   CLOCK
========================= */

setInterval(() => {

  if (
    state.active?.mode === "ready"
  ) {

    updateGetReadyElapsed();

  }


  if (
    state.active?.mode === "feeding"
  ) {

    updateFeedingElapsed();

  }


  if (!state.active) {

    updateGetReadyCountdown();

  }


  renderProgress();

}, 1000);


/* =========================
   SERVICE WORKER
========================= */

if ("serviceWorker" in navigator) {

  navigator.serviceWorker
    .register("sw.js")
    .catch(() => {});

}


/* =========================
   FIRST LOAD
========================= */

if (
  !localStorage.getItem(KEY)
) {

  $("setupCard")
    .classList
    .remove("hidden");

}


render();
