const KEY = "next-feed-v3";

const defaults = {

  basis: "finish",

  // 2h 45m default
  defaultIntervalMinutes: 165,

  // Interval used for the next cycle
  nextIntervalMinutes: 165,

  goal: 8,

  initialReadyMinutes: 15,

  feeds: [],

  active: null

};

let state = load();

const $ = id => document.getElementById(id);

let editingFeedIndex = null;

/* =========================
   STORAGE
========================= */

function load() {

  try {

    const saved =
      JSON.parse(
        localStorage.getItem(KEY) || "{}"
      );


    const merged = {
      ...defaults,
      ...saved
    };


    /*
      Backward compatibility:
      if older app data used min/max,
      convert the midpoint to minutes.
    */

    if (
      saved.nextIntervalMinutes == null &&
      saved.min != null &&
      saved.max != null
    ) {

      merged.nextIntervalMinutes =
        Math.round(
          ((saved.min + saved.max) / 2)
          * 60
        );

    }


    if (
      saved.defaultIntervalMinutes == null
    ) {

      merged.defaultIntervalMinutes =
        merged.nextIntervalMinutes;

    }


    return merged;

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

  return value * 60 * 60 * 1000;

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

function toDateTimeLocalValue(timestamp) {

  if (!timestamp) {
    return "";
  }


  const date =
    new Date(timestamp);


  const offset =
    date.getTimezoneOffset() *
    60000;


  return new Date(
    timestamp - offset
  )
    .toISOString()
    .slice(0, 16);

}

function intervalText(totalMinutes) {

  const hours =
    Math.floor(totalMinutes / 60);

  const minutes =
    totalMinutes % 60;


  if (minutes === 0) {

    return `${hours}h`;

  }


  if (hours === 0) {

    return `${minutes}m`;

  }


  return `${hours}h ${minutes}m`;

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


  const target =
    base +
    state.nextIntervalMinutes *
    60 *
    1000;


  return {

    lo: target,

    hi: target

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

function renderIntervalPicker() {

  $("selectedIntervalText").textContent =
    `Current target: ${
      intervalText(
        state.nextIntervalMinutes
      )
    }`;

  document
    .querySelectorAll(".interval-option")
    .forEach(button => {

      const minutes =
        Number(
          button.dataset.minutes
        );

      button
        .classList
        .toggle(
          "selected",
          minutes ===
          state.nextIntervalMinutes
        );

    });

}

function render() {

  setupUI();

  renderIntervalPicker();

  renderProgress();

  renderProjectedSchedule();

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
  fmtTime(window.lo);

  $("selectedIntervalText").textContent =
  `Current target: ${
    intervalText(
      state.nextIntervalMinutes
    )
  }`;  

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
   FEEDING HISTORY
========================= */

function renderHistory() {

  const recentFeeds =
    state.feeds
      .map((feed, index) => ({
        feed,
        originalIndex: index
      }))
      .reverse()
      .slice(0, 10);


  if (!recentFeeds.length) {

    $("history").innerHTML =
      `<div class="muted">
        No completed feedings yet.
      </div>`;

    return;

  }


  $("history").innerHTML =
    recentFeeds
      .map((item, displayIndex) => {

        const feed =
          item.feed;


        const feedNumber =
          state.feeds.length -
          displayIndex;


        const feedingDuration =
          feed.finish -
          feed.feedingStart;


        let readyText =
          "Get-ready time not recorded";


        if (
          feed.readyStart &&
          feed.readyDuration > 0
        ) {

          readyText =
            `Get ready: ${durationText(
              feed.readyDuration
            )}`;

        }


        return `
          <div class="history-row">

            <div>

              <b>
                Feed #${feedNumber}
              </b>

              <small>
                ${fmtTime(feed.feedingStart)}
                →
                ${fmtTime(feed.finish)}
              </small>

              <small>
                ${readyText}
              </small>

              <div class="history-actions">

                <button
                  class="edit-feed-btn"
                  data-feed-index="${item.originalIndex}"
                >
                  Edit
                </button>

              </div>

            </div>


            <div>

              ${durationText(
                feedingDuration
              )}

            </div>

          </div>
        `;

      })
      .join("");


  document
    .querySelectorAll(".edit-feed-btn")
    .forEach(button => {

      button.onclick = () => {

        const index =
          Number(
            button.dataset.feedIndex
          );


        openEditFeeding(index);

      };

    });

}


/* =========================
   MANUAL FEEDING ENTRY
========================= */

function showFeedingEditor() {

  $("homeView")
    .classList
    .add("hidden");


  $("settingsView")
    .classList
    .add("hidden");


  $("feedingEditor")
    .classList
    .remove("hidden");


  $("manualEntryError")
    .classList
    .add("hidden");

}


function closeFeedingEditor() {

  editingFeedIndex =
    null;


  $("feedingEditor")
    .classList
    .add("hidden");


  $("homeView")
    .classList
    .remove("hidden");


  $("manualReadyStart").value =
    "";

  $("manualFeedingStart").value =
    "";

  $("manualFeedingFinish").value =
    "";


  $("manualEntryError")
    .classList
    .add("hidden");


  render();

}


function openAddFeeding() {

  editingFeedIndex =
    null;


  $("feedingEditorTitle").textContent =
    "Add Missed Feeding";


  $("saveManualFeeding").textContent =
    "SAVE FEEDING";


  $("manualReadyStart").value =
    "";


  /*
    For convenience, default the feeding
    start and finish near the current time.
    The user can overwrite both.
  */

  const now =
    Date.now();


  $("manualFeedingStart").value =
    toDateTimeLocalValue(now);


  $("manualFeedingFinish").value =
    toDateTimeLocalValue(now);


  showFeedingEditor();

}


function openEditFeeding(index) {

  const feed =
    state.feeds[index];


  if (!feed) {
    return;
  }


  editingFeedIndex =
    index;


  $("feedingEditorTitle").textContent =
    "Edit Feeding";


  $("saveManualFeeding").textContent =
    "SAVE CHANGES";


  $("manualReadyStart").value =
    feed.readyStart
      ? toDateTimeLocalValue(
          feed.readyStart
        )
      : "";


  $("manualFeedingStart").value =
    toDateTimeLocalValue(
      feed.feedingStart
    );


  $("manualFeedingFinish").value =
    toDateTimeLocalValue(
      feed.finish
    );


  showFeedingEditor();

}


function showManualEntryError(message) {

  const element =
    $("manualEntryError");


  element.textContent =
    message;


  element
    .classList
    .remove("hidden");

}


function saveManualFeedingEntry() {

  const readyValue =
    $("manualReadyStart").value;


  const feedingStartValue =
    $("manualFeedingStart").value;


  const finishValue =
    $("manualFeedingFinish").value;


  /*
    Feeding start and finish are required.
  */

  if (
    !feedingStartValue ||
    !finishValue
  ) {

    showManualEntryError(
      "Please enter when baby started eating and when the feeding finished."
    );

    return;

  }


  const feedingStart =
    new Date(
      feedingStartValue
    ).getTime();


  const finish =
    new Date(
      finishValue
    ).getTime();


  let readyStart =
    null;


  if (readyValue) {

    readyStart =
      new Date(
        readyValue
      ).getTime();

  }


  /*
    Validate the chronological order.
  */

  if (
    !Number.isFinite(feedingStart) ||
    !Number.isFinite(finish)
  ) {

    showManualEntryError(
      "One of the entered times is invalid."
    );

    return;

  }


  if (
    finish <= feedingStart
  ) {

    showManualEntryError(
      "Feeding finish must be after baby started eating."
    );

    return;

  }


  if (
    readyStart &&
    readyStart > feedingStart
  ) {

    showManualEntryError(
      "Get-ready start must be before baby started eating."
    );

    return;

  }


  /*
    Don't accidentally allow a future
    feeding record.
  */

  if (
    feedingStart > Date.now() ||
    finish > Date.now()
  ) {

    showManualEntryError(
      "Feeding times cannot be in the future."
    );

    return;

  }


  let readyDuration =
    null;


  if (readyStart) {

    readyDuration =
      feedingStart -
      readyStart;

  }


  const feed = {

  readyStart,

  readyDuration,

  feedingStart,

  finish,

  targetIntervalMinutes:
    state.nextIntervalMinutes

};


  /*
    Edit existing or create new.
  */

  if (
    editingFeedIndex !== null
  ) {

    state.feeds[
      editingFeedIndex
    ] = feed;

  } else {

    state.feeds.push(feed);

  }


  /*
    Important:
    Manual entries may be inserted for
    an earlier time, so sort all feeds
    chronologically afterward.
  */

  state.feeds.sort(
    (a, b) =>
      a.feedingStart -
      b.feedingStart
  );


  save();


  closeFeedingEditor();

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
    state.active.readyDuration,

  targetIntervalMinutes:
    state.nextIntervalMinutes

};


  state.feeds.push(feed);

  state.nextIntervalMinutes =
  state.defaultIntervalMinutes;

  state.active =
    null;


  save();

  render();

}

function planningIntervalHours() {

  return (
    state.min +
    state.max
  ) / 2;

}

/* =========================
   UPCOMING FEEDINGS
========================= */
function renderProjectedSchedule() {

  const container =
    $("projectedSchedule");


  if (!state.feeds.length) {

    container.innerHTML =
      `<div class="muted">
        Complete your first feeding to see upcoming projections.
      </div>`;

    return;

  }


  const lastFeed =
    state.feeds[
      state.feeds.length - 1
    ];


  const intervalMs =
  state.nextIntervalMinutes *
  60 *
  1000;


  /*
    Because your schedule is based on the
    previous feeding FINISH time, start the
    first projection from that timestamp.
  */

  let projectedTime =
    lastFeed.finish +
    intervalMs;


  const projections = [];


  for (
    let i = 0;
    i < 8;
    i++
  ) {

    projections.push({
      number: i + 1,
      time: projectedTime
    });


    projectedTime +=
      intervalMs;

  }


  container.innerHTML =
    projections
      .map(item => {

        const label =
          item.number === 1
            ? "Next"
            : `Feed ${item.number}`;

        return `
          <div class="projected-row">

            <span>
              ${label}
            </span>

            <strong>
              ${fmtTime(item.time)}
            </strong>

          </div>
        `;

      })
      .join("");


  const interval =
    planningIntervalHours();


  const hours =
    Math.floor(interval);


  const minutes =
    Math.round(
      (interval - hours) * 60
    );


  $("projectionNote").textContent =
  `Planning estimate: ${
    intervalText(
      state.nextIntervalMinutes
    )
  } between feeds. Updates automatically after each completed feeding.`;

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

$("addFeedingBtn").onclick = () => {

  openAddFeeding();

};


$("closeFeedingEditor").onclick = () => {

  closeFeedingEditor();

};


$("saveManualFeeding").onclick = () => {

  saveManualFeedingEntry();

};

/* =========================
   INTERVAL BUTTONS
========================= */

document
  .querySelectorAll(".interval-option")
  .forEach(button => {

    button.onclick = () => {

      const minutes =
        Number(
          button.dataset.minutes
        );

      state.nextIntervalMinutes =
        minutes;

      state.defaultIntervalMinutes =
        minutes;

      save();

      render();

    };

  });

/* =========================
   CUSTOM INTERVAL
========================= */

$("customIntervalBtn").onclick = () => {

  $("customIntervalFields")
    .classList
    .toggle("hidden");

};


$("applyCustomInterval").onclick = () => {

  const hours =
    Number(
      $("customIntervalHours").value
    );

  const minutes =
    Number(
      $("customIntervalMinutes").value
    );

  const total =
    (hours * 60) +
    minutes;


  if (
    !Number.isFinite(total) ||
    total <= 0
  ) {

    alert(
      "Please enter a valid interval."
    );

    return;

  }


  state.nextIntervalMinutes =
    total;

  state.defaultIntervalMinutes =
    total;

  save();


  $("customIntervalFields")
    .classList
    .add("hidden");

  render();

};


/* =========================
   SETTINGS
========================= */

$("settingsBtn").onclick = () => {

  $("homeView")
    .classList
    .add("hidden");


  $("feedingEditor")
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
