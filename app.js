const STORAGE_KEY = "flagQuestSavedGame";

const regions = [
  { id: "Asia", label: "🌏 Asia" },
  { id: "Europe", label: "🌍 Europe" },
  { id: "Africa", label: "🌍 Africa" },
  { id: "North America", label: "🌎 North America" },
  { id: "South America", label: "🌎 South America" },
  { id: "Oceania", label: "🌊 Oceania" }
];

/*
  Starter library: 24 countries, four in each region.
  Add more country objects here to expand the game.
*/
let countries = [];

const easyCountryCodes = new Set([
  "AU", "BR", "CA", "CN", "DE", "FR", "GB", "IN",
  "IT", "JP", "KR", "MY", "US"
]);

const hardCountryCodes = new Set([
  "TD", "ID", "MC", "RO"
]);

function mapWorldRegion(region, subregion) {
  if (region === "Asia") return "Asia";
  if (region === "Europe") return "Europe";
  if (region === "Africa") return "Africa";
  if (region === "Oceania") return "Oceania";

  if (region === "Americas") {
    if (subregion === "South America") return "South America";
    return "North America";
  }

  return null;
}

async function loadCountryData() {
  const response = await fetch(
    "https://restcountries.com/v3.1/all?fields=name,cca2,capital,region,subregion"
  );

  if (!response.ok) {
    throw new Error("Could not download country data.");
  }

  const records = await response.json();

  countries = records
    .map((record) => {
      const code = record.cca2;
      const name = record.name?.common;
      const region = mapWorldRegion(record.region, record.subregion);
      const capital = record.capital?.[0] || "Not listed";

      if (!code || !name || !region) return null;

      let difficulty = "medium";

      if (easyCountryCodes.has(code)) {
        difficulty = "easy";
      } else if (hardCountryCodes.has(code)) {
        difficulty = "hard";
      }

      return {
        code,
        name,
        flag: "",
        capital,
        region,
        difficulty,
        fact: `The capital of ${name} is ${capital}.`
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (countries.length < 100) {
    throw new Error("The country list did not load completely.");
  }
}

const achievements = [
  {
    id: "first-flight",
    title: "First Flight",
    description: "Discover your first country.",
    icon: "✈️",
    requirement: (state) => state.discovered.length >= 1
  },
  {
    id: "asia-explorer",
    title: "Asia Explorer",
    description: "Discover all 4 starter countries in Asia.",
    icon: "🌏",
    requirement: (state) => countDiscoveredInRegion(state, "Asia") >= 4
  },
  {
    id: "world-traveler",
    title: "World Traveler",
    description: "Discover 20 countries.",
    icon: "🧭",
    requirement: (state) => state.discovered.length >= 20
  },
  {
    id: "flag-master",
    title: "Flag Master",
    description: "Discover every country in this starter library.",
    icon: "🏆",
    requirement: (state) => state.discovered.length >= countries.length
  }
];

const regionEmojis = {
  "Asia": "🌏",
  "Europe": "🌍",
  "Africa": "🌍",
  "North America": "🌎",
  "South America": "🌎",
  "Oceania": "🌊"
};

let savedState = loadSavedState();

let activeMode = "quick";
let activeRegion = null;
let activeDifficulty = "auto";
let challengeMode = false;

let questionList = [];
let questionIndex = 0;
let currentCountry = null;
let currentQuestionStarted = 0;
let answeredThisQuestion = false;

let roundPoints = 0;
let roundCorrect = 0;
let currentStreak = 0;
let roundBestStreak = 0;
let roundDiscovered = 0;

let learnCountries = [];
let learnIndex = 0;

let audioContext = null;
let musicTimer = null;
let musicStep = 0;

const revealAnswerButton = document.getElementById("reveal-answer-button");

function defaultState() {
  return {
    points: 0,
    discovered: [],
    bestStreak: 0,
    totalCorrect: 0,
    achievements: [],
    settings: {
      sound: true,
      music: false,
      voice: false,
      difficulty: "auto",
      challengeMode: false
    }
  };
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();

    const parsed = JSON.parse(raw);
    const defaults = defaultState();

    return {
      ...defaults,
      ...parsed,
      settings: {
        ...defaults.settings,
        ...(parsed.settings || {})
      },
      discovered: Array.isArray(parsed.discovered) ? parsed.discovered : [],
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : []
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
}

function countDiscoveredInRegion(state, region) {
  return countries.filter((country) =>
    country.region === region && state.discovered.includes(country.code)
  ).length;
}

function getUnlockedRegions() {
  const unlocked = [regions[0].id];

  for (let index = 1; index < regions.length; index += 1) {
    const previousRegion = regions[index - 1].id;

    const previousCountries = countries.filter(
      (country) => country.region === previousRegion
    );

    const discoveredInPreviousRegion = previousCountries.filter(
      (country) => savedState.discovered.includes(country.code)
    ).length;

    // Unlock the next region after discovering up to three countries
    // in the previous region.
    const requiredDiscoveries = Math.min(3, previousCountries.length);

    if (
      previousCountries.length > 0 &&
      discoveredInPreviousRegion >= requiredDiscoveries
    ) {
      unlocked.push(regions[index].id);
    } else {
      break;
    }
  }

  return unlocked;
}

function updateHeaderAndHome() {
  document.getElementById("header-points").textContent = savedState.points;
  document.getElementById("home-discovered").textContent =
    `${savedState.discovered.length} / ${countries.length}`;
  document.getElementById("home-best-streak").textContent = savedState.bestStreak;
  document.getElementById("home-awards").textContent =
    `${savedState.achievements.length} / ${achievements.length}`;

  renderWorldMap();
  renderAchievements();
}

function setScreen(screenName) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  const screen = document.getElementById(`${screenName}-screen`);
  if (screen) screen.classList.add("active");

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screenName);
  });

  if (screenName === "settings") renderSettings();
  if (screenName === "map") renderWorldMap();
  if (screenName === "achievements") renderAchievements();
  if (screenName === "learn") setupLearnMode();
}

function getDifficultyForQuestion() {
  if (activeDifficulty !== "auto") return activeDifficulty;

  if (savedState.totalCorrect < 6) return "easy";
  if (savedState.totalCorrect < 15) return "medium";
  return "hard";
}

function allowedCountries(pool, difficulty) {
  const rank = { easy: 1, medium: 2, hard: 3 };
  const maxRank = rank[difficulty] || 1;

  const filtered = pool.filter((country) => rank[country.difficulty] <= maxRank);
  return filtered.length >= 4 ? filtered : pool;
}

function getQuizPool() {
  if (activeMode === "region" && activeRegion) {
    return countries.filter((country) => country.region === activeRegion);
  }

  if (activeMode === "world") {
    const unlockedRegions = getUnlockedRegions();
    return countries.filter((country) => unlockedRegions.includes(country.region));
  }

  return countries;
}

function shuffled(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function makeQuestionList(pool, numberOfQuestions) {
  let result = [];
  let previousCode = null;

  while (result.length < numberOfQuestions) {
    const batch = shuffled(pool).filter((country) => country.code !== previousCode);

    for (const country of batch) {
      if (result.length >= numberOfQuestions) break;
      result.push(country);
      previousCode = country.code;
    }
  }

  return result;
}

function startGame(modeOverride = null) {
  activeMode = modeOverride || document.getElementById("mode-select").value;
  activeDifficulty = savedState.settings.difficulty;
  challengeMode = savedState.settings.challengeMode;

  const selectedRegion = document.getElementById("region-select").value;
  activeRegion = activeMode === "region" ? selectedRegion : null;

  let pool = getQuizPool();

  if (activeMode === "region" && activeRegion) {
    pool = countries.filter((country) => country.region === activeRegion);
  }

  const difficulty = getDifficultyForQuestion();
  pool = allowedCountries(pool, difficulty);

  if (pool.length === 0) {
    window.alert("There are no countries available for this selection yet.");
    return;
  }

  const questionCount = activeMode === "region"
    ? Math.min(10, pool.length)
    : activeMode === "world"
      ? Math.min(10, pool.length)
      : 10;

  questionList = makeQuestionList(pool, questionCount);
  questionIndex = 0;
  roundPoints = 0;
  roundCorrect = 0;
  currentStreak = 0;
  roundBestStreak = 0;
  roundDiscovered = 0;

  setScreen("game");
function displayCountryFlag(elementId, country) {
  const container = document.getElementById(elementId);

  if (!container || !country) return;

  const image = document.createElement("img");
  image.src = `https://flagcdn.com/w320/${country.code.toLowerCase()}.png`;
  image.alt = `${country.name} flag`;
  image.width = 320;
  image.loading = "eager";

  image.onerror = () => {
    container.textContent = country.flag || country.code;
  };

  container.replaceChildren(image);
  container.setAttribute("aria-label", `${country.name} flag`);
}

  showQuestion();
}
function displayCountryFlag(elementId, country) {
  const container = document.getElementById(elementId);

  if (!container || !country) {
    console.error("Could not find the flag area or country data.");
    return;
  }

  // Show the emoji immediately as a fallback.
  container.textContent = country.flag;
  container.setAttribute("aria-label", `${country.name} flag`);

  // Try to load a flag image. The country code must be a two-letter code,
  // such as JP, MY, or US.
  const image = document.createElement("img");
  image.src = `https://flagcdn.com/w320/${country.code.toLowerCase()}.png`;
  image.alt = `${country.name} flag`;
  image.width = 320;

  image.onerror = () => {
    // Keep the emoji if the image cannot load.
    container.textContent = country.flag;
  };

  container.replaceChildren(image);
}
function showQuestion() {
  if (questionIndex >= questionList.length) {
    finishRound();
    return;
  }

  currentCountry = questionList[questionIndex];
  currentQuestionStarted = Date.now();
  answeredThisQuestion = false;

  const difficulty = getDifficultyForQuestion();
  const difficultyNames = {
    easy: "🟢 Easy",
    medium: "🟡 Medium",
    hard: "🔴 Hard"
  };

  document.getElementById("round-label").textContent =
    `Question ${questionIndex + 1} of ${questionList.length}`;

  document.getElementById("round-points").textContent = roundPoints;
  document.getElementById("round-streak").textContent = currentStreak;
  document.getElementById("difficulty-label").textContent =
    difficultyNames[difficulty];

  document.getElementById("round-progress").style.width =
    `${(questionIndex / questionList.length) * 100}%`;

displayCountryFlag("question-flag", currentCountry);

  document.getElementById("region-chip").textContent =
    `${regionEmojis[currentCountry.region]} ${currentCountry.region}`;

  const feedback = document.getElementById("answer-feedback");
  feedback.textContent = "Choose the country that matches the flag.";
  feedback.className = "answer-feedback";

  document.getElementById("fact-card").classList.add("hidden");
  document.getElementById("next-question-button").classList.add("hidden");

  const optionsContainer = document.getElementById("answer-options");
  const typedForm = document.getElementById("typed-answer-form");
  const typedInput = document.getElementById("typed-answer");

  optionsContainer.innerHTML = "";
  typedInput.value = "";

if (challengeMode) {
  optionsContainer.classList.add("hidden");
  typedForm.classList.remove("hidden");
  revealAnswerButton.classList.remove("hidden");

  typedInput.disabled = false;
  typedForm.querySelector("button").disabled = false;
  revealAnswerButton.disabled = false;
  typedInput.focus();
} else {
  typedForm.classList.add("hidden");
  revealAnswerButton.classList.add("hidden");
  optionsContainer.classList.remove("hidden");

  renderAnswerOptions();
}

  if (savedState.settings.voice) {
    speak("Which country is this?");
  }
}

function renderAnswerOptions() {
  const container = document.getElementById("answer-options");

  const basePool = activeMode === "region" && activeRegion
    ? countries.filter((country) => country.region === activeRegion)
    : countries;

  const difficultyPool = allowedCountries(basePool, getDifficultyForQuestion());
  const otherCountries = shuffled(
    difficultyPool.filter((country) => country.code !== currentCountry.code)
  );

  const options = shuffled([
    currentCountry,
    ...otherCountries.slice(0, 3)
  ]);

  container.innerHTML = "";

  options.forEach((country) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button";
    button.textContent = country.name;

    button.addEventListener("click", () => {
      submitAnswer(country.name, button);
    });

    container.appendChild(button);
  });
}

function normalizeAnswer(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function submitTypedAnswer(event) {
  event.preventDefault();

  const input = document.getElementById("typed-answer");
  submitAnswer(input.value);
}

function submitAnswer(answer, selectedButton = null) {
  if (answeredThisQuestion) return;

  if (normalizeAnswer(answer) === normalizeAnswer(currentCountry.name)) {
    handleCorrectAnswer(selectedButton);
  } else {
    handleTryAgain();
  }
}

function handleCorrectAnswer(selectedButton) {
  answeredThisQuestion = true;

  const elapsedSeconds = (Date.now() - currentQuestionStarted) / 1000;
  const speedBonus = elapsedSeconds <= 5 ? 25 : 0;
  const streakBonus = currentStreak >= 2 ? 25 : 0;
  const earned = 100 + speedBonus + streakBonus;

  roundPoints += earned;
  roundCorrect += 1;
  currentStreak += 1;
  roundBestStreak = Math.max(roundBestStreak, currentStreak);

  savedState.points += earned;
  savedState.totalCorrect += 1;

  if (!savedState.discovered.includes(currentCountry.code)) {
    savedState.discovered.push(currentCountry.code);
    roundDiscovered += 1;
  }

  savedState.bestStreak = Math.max(savedState.bestStreak, currentStreak);

  updateAchievements();
  saveState();
  updateHeaderAndHome();

  if (selectedButton) {
    selectedButton.classList.add("selected-correct");
  }

  const feedback = document.getElementById("answer-feedback");
  feedback.textContent = `Awesome! That's ${currentCountry.name}! +${earned} points`;
  feedback.className = "answer-feedback correct";

  document.getElementById("round-points").textContent = roundPoints;
  document.getElementById("round-streak").textContent = currentStreak;

  document.getElementById("fact-title").textContent =
    `🌟 ${currentCountry.name} fact`;
  document.getElementById("fact-text").textContent = currentCountry.fact;
  document.getElementById("fact-card").classList.remove("hidden");
  document.getElementById("next-question-button").classList.remove("hidden");

  disableAnswers();

  playTone("correct");

  if (savedState.settings.voice) {
    speak(`Awesome! That's ${currentCountry.name}. ${currentCountry.fact}`);
  }
}

function handleTryAgain() {
  const feedback = document.getElementById("answer-feedback");
  feedback.textContent = "Almost! Try again — you can do it!";
  feedback.className = "answer-feedback encourage";

  playTone("gentle");

  if (savedState.settings.voice) {
    speak("Almost! Try again. You can do it!");
  }

  // Clear a typed guess so the player can easily try again.
  if (challengeMode) {
    const input = document.getElementById("typed-answer");
    input.value = "";
    input.focus();
  }
}

function revealAnswerAndContinue() {
  if (answeredThisQuestion) return;

  answeredThisQuestion = true;

  const feedback = document.getElementById("answer-feedback");
  feedback.textContent =
    `This flag belongs to ${currentCountry.name}. Let’s learn it!`;
  feedback.className = "answer-feedback encourage";

  document.getElementById("fact-title").textContent =
    `🌟 ${currentCountry.name} fact`;
  document.getElementById("fact-text").textContent = currentCountry.fact;
  document.getElementById("fact-card").classList.remove("hidden");
  document.getElementById("next-question-button").classList.remove("hidden");

  // Prevent another answer from being submitted on this question.
  disableAnswers();

  if (savedState.settings.voice) {
    speak(`This flag belongs to ${currentCountry.name}. ${currentCountry.fact}`);
  }
}

function disableAnswers() {
  document.querySelectorAll(".answer-button").forEach((button) => {
    button.disabled = true;
  });

  document.getElementById("typed-answer").disabled = true;
  document.querySelector("#typed-answer-form button").disabled = true;
}

function nextQuestion() {
  questionIndex += 1;
  showQuestion();
}

function finishRound() {
  document.getElementById("round-progress").style.width = "100%";

  document.getElementById("result-correct").textContent =
    `${roundCorrect} / ${questionList.length}`;
  document.getElementById("result-points").textContent = roundPoints;
  document.getElementById("result-streak").textContent = roundBestStreak;
  document.getElementById("result-discovered").textContent = roundDiscovered;

  let message = "Every flag you saw was a new chance to learn!";
  if (roundCorrect === questionList.length) {
    message = "Amazing! You recognized every flag in this round!";
  } else if (roundCorrect >= Math.ceil(questionList.length * 0.7)) {
    message = "Fantastic exploring! You know lots of flags!";
  } else if (roundCorrect > 0) {
    message = "Great effort! Keep exploring and you’ll learn even more.";
  }

  document.getElementById("result-message").textContent = message;
  setScreen("results");
  playTone("achievement");

  if (savedState.settings.voice) {
    speak("Great exploring! You completed your round.");
  }
}

function updateAchievements() {
  achievements.forEach((achievement) => {
    if (
      achievement.requirement(savedState) &&
      !savedState.achievements.includes(achievement.id)
    ) {
      savedState.achievements.push(achievement.id);
      playTone("achievement");
    }
  });
}

function renderAchievements() {
  const list = document.getElementById("achievement-list");
  list.innerHTML = "";

  achievements.forEach((achievement) => {
    const unlocked = savedState.achievements.includes(achievement.id);

    const card = document.createElement("article");
    card.className = `achievement-card${unlocked ? "" : " locked"}`;

    const icon = document.createElement("span");
    icon.className = "achievement-icon";
    icon.textContent = unlocked ? "🏅" : achievement.icon;

    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = achievement.title;

    const description = document.createElement("p");
    description.textContent = achievement.description;

    copy.append(title, description);

    const status = document.createElement("span");
    status.className = "achievement-status";
    status.textContent = unlocked ? "Earned ✓" : "Locked";

    card.append(icon, copy, status);
    list.appendChild(card);
  });
}

function renderWorldMap() {
  const list = document.getElementById("region-map-list");
  const unlockedRegions = getUnlockedRegions();
  list.innerHTML = "";

  const discoveredCount = savedState.discovered.length;
  document.getElementById("map-discovered-count").textContent =
    `${discoveredCount} / ${countries.length} countries discovered`;

  document.getElementById("map-progress-fill").style.width =
    `${(discoveredCount / countries.length) * 100}%`;

  regions.forEach((region) => {
    const regionCountries = countries.filter(
      (country) => country.region === region.id
    );

    const found = regionCountries.filter(
      (country) => savedState.discovered.includes(country.code)
    ).length;

    const unlocked = unlockedRegions.includes(region.id);

    const card = document.createElement("article");
    card.className = `region-card${unlocked ? "" : " locked"}`;

    const top = document.createElement("div");
    top.className = "region-card-top";

    const emoji = document.createElement("span");
    emoji.className = "region-emoji";
    emoji.textContent = unlocked ? regionEmojis[region.id] : "🔒";

    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = region.id;

    const count = document.createElement("p");
    count.textContent = unlocked
      ? `${found} of ${regionCountries.length} starter flags discovered`
      : "Discover the previous region to unlock";

    details.append(title, count);

    const status = document.createElement("span");
    status.className = "region-status";
    status.textContent = unlocked ? "Open" : "Locked";

    top.append(emoji, details, status);
    card.appendChild(top);
    list.appendChild(card);
  });
}

function updateModeSetup() {
  const mode = document.getElementById("mode-select").value;
  const regionField = document.getElementById("region-field");
  const regionSelect = document.getElementById("region-select");
  const message = document.getElementById("locked-region-message");

  regionField.classList.toggle("hidden", mode !== "region");
  message.classList.add("hidden");

  const unlockedRegions = getUnlockedRegions();
  regionSelect.innerHTML = "";

  regions.forEach((region) => {
    const option = document.createElement("option");
    option.value = region.id;
    option.textContent = `${unlockedRegions.includes(region.id) ? "" : "🔒 "}${region.label}`;
    option.disabled = !unlockedRegions.includes(region.id);
    regionSelect.appendChild(option);
  });

  const firstAvailable = unlockedRegions[0];
  regionSelect.value = firstAvailable;
}

function setupLearnMode() {
  const select = document.getElementById("learn-region-select");
  const previousValue = select.value;

  select.innerHTML = "";

  regions.forEach((region) => {
    const option = document.createElement("option");
    option.value = region.id;
    option.textContent = region.label;
    select.appendChild(option);
  });

  if (regions.some((region) => region.id === previousValue)) {
    select.value = previousValue;
  }

  const matching = countries.filter(
    (country) => country.region === select.value
  );

  if (!learnCountries.length || !learnCountries.some((country) => country.region === select.value)) {
    learnCountries = matching;
    learnIndex = 0;
  }

  renderLearnCountry();
}

function renderLearnCountry() {
  const country = learnCountries[learnIndex];
  if (!country) return;

  document.getElementById("learn-region-chip").textContent =
    `${regionEmojis[country.region]} ${country.region}`;
  displayCountryFlag("learn-flag", country);
  document.getElementById("learn-country-name").textContent = country.name;
  document.getElementById("learn-capital").textContent = country.capital;
  document.getElementById("learn-region-name").textContent = country.region;
  document.getElementById("learn-fact").textContent = `Did you know? ${country.fact}`;
}

function nextLearnCountry() {
  const selectedRegion = document.getElementById("learn-region-select").value;
  learnCountries = countries.filter((country) => country.region === selectedRegion);

  if (learnCountries.length === 0) return;

  learnIndex = (learnIndex + 1) % learnCountries.length;
  renderLearnCountry();
}

function renderSettings() {
  document.getElementById("sound-setting").checked = savedState.settings.sound;
  document.getElementById("music-setting").checked = savedState.settings.music;
  document.getElementById("voice-setting").checked = savedState.settings.voice;
}

function ensureAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioContext = new AudioContextClass();
  }

  if (audioContext?.state === "suspended") {
    audioContext.resume();
  }
}

function playTone(kind) {
  if (!savedState.settings.sound) return;

  ensureAudio();
  if (!audioContext) return;

  const notes = kind === "correct"
    ? [660, 880]
    : kind === "achievement"
      ? [523, 659, 784, 1047]
      : [360];

  const start = audioContext.currentTime;

  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const noteStart = start + index * 0.11;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.07, noteStart + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.19);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.2);
  });
}

function startMusic() {
  if (musicTimer || !savedState.settings.music) return;

  ensureAudio();
  if (!audioContext) return;

  const notes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];

  musicTimer = window.setInterval(() => {
    if (!audioContext || !savedState.settings.music) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.value = notes[musicStep % notes.length];

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.8);

    musicStep += 1;
  }, 850);
}

function stopMusic() {
  if (musicTimer) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
}

function speak(text) {
  if (!savedState.settings.voice || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1.08;

  window.speechSynthesis.speak(utterance);
}

/* Navigation */
document.querySelectorAll("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => setScreen(button.dataset.screen));
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;

    if (mode === "learn") {
      setupLearnMode();
      setScreen("learn");
      return;
    }

    document.getElementById("mode-select").value = mode;
    updateModeSetup();
    setScreen("play");
  });
});

document.getElementById("open-play-button").addEventListener("click", () => {
  updateModeSetup();
  setScreen("play");
});

document.getElementById("mode-select").addEventListener("change", updateModeSetup);

document.getElementById("start-game-button").addEventListener("click", () => {
  ensureAudio();
  startGame();
});

document.getElementById("exit-game-button").addEventListener("click", () => {
  const confirmed = window.confirm("Leave this round and return home?");
  if (confirmed) setScreen("home");
});

document.getElementById("next-question-button").addEventListener("click", nextQuestion);
document.getElementById("typed-answer-form").addEventListener("submit", submitTypedAnswer);

revealAnswerButton.addEventListener("click", revealAnswerAndContinue);

document.getElementById("learn-region-select").addEventListener("change", () => {
  const region = document.getElementById("learn-region-select").value;
  learnCountries = countries.filter((country) => country.region === region);
  learnIndex = 0;
  renderLearnCountry();
});

document.getElementById("next-country-button").addEventListener("click", nextLearnCountry);

document.getElementById("learn-speak-button").addEventListener("click", () => {
  const country = learnCountries[learnIndex];
  if (country) speak(country.name);
});

document.getElementById("play-again-button").addEventListener("click", () => {
  startGame(activeMode);
});

document.getElementById("sound-setting").addEventListener("change", (event) => {
  savedState.settings.sound = event.target.checked;
  saveState();
  if (event.target.checked) {
    ensureAudio();
    playTone("correct");
  }
});

document.getElementById("voice-setting").addEventListener("change", (event) => {
  savedState.settings.voice = event.target.checked;
  saveState();

  if (event.target.checked) {
    speak("Voice narration is on.");
  } else if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

document.getElementById("music-setting").addEventListener("change", (event) => {
  savedState.settings.music = event.target.checked;
  saveState();

  if (event.target.checked) {
    ensureAudio();
    startMusic();
  } else {
    stopMusic();
  }
});

document.getElementById("difficulty-select").addEventListener("change", (event) => {
  savedState.settings.difficulty = event.target.value;
  saveState();
});

document.getElementById("challenge-mode-toggle").addEventListener("change", (event) => {
  savedState.settings.challengeMode = event.target.checked;
  saveState();
});

document.getElementById("reset-progress-button").addEventListener("click", () => {
  const confirmed = window.confirm(
    "Reset your saved points, discoveries, awards, and settings?"
  );

  if (!confirmed) return;

  stopMusic();
  localStorage.removeItem(STORAGE_KEY);
  savedState = defaultState();
  updateHeaderAndHome();
  renderSettings();
});

/* Initialise */
document.getElementById("difficulty-select").value =
  savedState.settings.difficulty;
document.getElementById("challenge-mode-toggle").checked =
  savedState.settings.challengeMode;

async function initializeGame() {
  try {
    document.getElementById("home-discovered").textContent = "Loading countries…";

    await loadCountryData();

    updateModeSetup();
    updateHeaderAndHome();
    renderSettings();
  } catch (error) {
    console.error(error);

    window.alert(
      "The country list could not load. Please check your internet connection and reopen the game."
    );
  }
}

initializeGame();