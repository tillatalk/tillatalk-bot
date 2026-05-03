console.log("🔥 TILLATALK SMARTER COACH LOADED");

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const userMemory = {};

const practiceTopics = [
  {
    id: "past_simple_yesterday",
    title: "Past Simple",
    keywords: ["past", "past simple", "yesterday", "went", "did"],
    question: "What did you do yesterday?",
    instruction:
      "The conversation is about yesterday, so use past simple unless the user clearly talks about a habit.",
    examples: `
User: i go to gym yesterday
👉 You can say: "I went to the gym yesterday."
Nice. What did you train?

User: i do chest and tricep at gym
👉 You can say: "I did chest and triceps at the gym."
Good. What exercises did you do?
`,
  },
  {
    id: "daily_routine_present",
    title: "Daily Routine",
    keywords: ["present simple", "routine", "habit", "every day", "usually"],
    question: "What do you usually do in the morning?",
    instruction:
      "The conversation is about routines and habits, so use present simple unless the user clearly talks about the past or future.",
    examples: `
User: i wake up at 7
👉 You can say: "I wake up at 7."
Good. What do you do after that?

User: i go gym every day
👉 You can say: "I go to the gym every day."
Nice. What exercises do you usually do?
`,
  },
  {
    id: "future_plans",
    title: "Future Plans",
    keywords: ["future", "going to", "will", "tomorrow", "next week"],
    question: "What are you going to do tomorrow?",
    instruction:
      "The conversation is about future plans, so use 'going to' or future forms unless the user clearly talks about the past or habits.",
    examples: `
User: tomorrow i go gym
👉 You can say: "Tomorrow, I’m going to go to the gym."
Nice. What are you going to train?

User: i see my friend tomorrow
👉 You can say: "I’m going to see my friend tomorrow."
Cool. Where are you going to meet?
`,
  },
  {
    id: "likes_gerunds",
    title: "Likes",
    keywords: ["like", "likes", "gerund", "to infinitive", "like doing"],
    question: "What do you like doing after work?",
    instruction:
      "The conversation is about likes, so use patterns like 'I like doing...' or 'I like to...'.",
    examples: `
User: i like drink coffee
👉 You can say: "I like drinking coffee."
Nice. What kind of coffee do you like?

User: i like train legs
👉 You can say: "I like training legs."
Good. What leg exercise do you like most?
`,
  },
  {
    id: "negatives",
    title: "Negatives",
    keywords: ["negative", "negatives", "don't", "doesn't", "do not", "no like"],
    question: "What food don’t you like?",
    instruction:
      "The conversation is about negative sentences, so use don't/doesn't correctly.",
    examples: `
User: i no like fish
👉 You can say: "I don’t like fish."
Fair enough. What food do you like?

User: she no like coffee
👉 You can say: "She doesn’t like coffee."
Okay. What does she like instead?
`,
  },
];

function getRandomPracticeTopic() {
  return practiceTopics[Math.floor(Math.random() * practiceTopics.length)];
}

function getPracticeTopicById(id) {
  return practiceTopics.find((topic) => topic.id === id) || practiceTopics[0];
}

function getTopFocusAreas(memory) {
  const entries = Object.entries(memory.focusCounts || {});

  if (entries.length === 0) {
    return "No patterns yet";
  }

  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([focus, count]) => `${focus} (${count}x)`)
    .join("\n");
}

function findTopicFromFocus(focus) {
  if (!focus) return null;

  const cleanFocus = focus.toLowerCase();

  return practiceTopics.find((topic) =>
    topic.keywords.some((keyword) => cleanFocus.includes(keyword.toLowerCase()))
  );
}

function choosePracticeTopic(memory) {
  const focusEntries = Object.entries(memory.focusCounts || {}).sort(
    (a, b) => b[1] - a[1]
  );

  const shouldUseWeakness = focusEntries.length > 0 && Math.random() < 0.9;

  if (shouldUseWeakness) {
    for (const [focus] of focusEntries) {
      const matchedTopic = findTopicFromFocus(focus);

      if (matchedTopic) {
        return matchedTopic;
      }
    }
  }

  return getRandomPracticeTopic();
}

function formatPracticeHistory(memory) {
  if (!memory.practiceHistory || memory.practiceHistory.length === 0) {
    return "No practice history yet.";
  }

  return memory.practiceHistory
    .slice(-6)
    .map((item, index) => `${index + 1}. User: ${item.user}\nBot: ${item.bot}`)
    .join("\n\n");
}

app.get("/", (req, res) => {
  res.send("TillaTalk is running ✅");
});

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message) {
      const from = message.from;
      const text = message.text?.body?.trim();

      if (!text) {
        return res.sendStatus(200);
      }

      console.log("📩 Incoming:", text);
      console.log("👤 From:", from);

      if (!userMemory[from]) {
        userMemory[from] = {
          conversationMode: false,
          messageCount: 0,
          practiceTopic: null,
          focusCounts: {},
          practiceStep: 0,
          practiceHistory: [],
        };
      }

      const memory = userMemory[from];
      memory.messageCount++;

      let reply = await getReply(text, memory);

      if (memory.messageCount === 1) {
        reply = `👋 Hola, soy tu coach de inglés.

Envíame una frase y la corrijo.

• "practice"
• "what should I improve?"
• "new topic"
• "stop"

${reply}`;
      }

      console.log("🤖 Reply:", reply);

      await sendMessage(from, reply);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

async function sendMessage(to, body) {
  await axios.post(
    `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function getReply(text, memory) {
  const lower = text.toLowerCase().trim();

  if (/^(stop|exit|quit|normal)$/i.test(lower)) {
    memory.conversationMode = false;
    memory.practiceTopic = null;
    memory.practiceStep = 0;
    memory.practiceHistory = [];

    return `✅ Back to correction mode.

Send me a sentence and I’ll fix it 👇`;
  }

  if (
    lower.includes("what should i improve") ||
    lower.includes("my mistakes") ||
    lower.includes("what am i doing wrong")
  ) {
    const topFocusAreas = getTopFocusAreas(memory);

    return `🧠 Tus áreas principales ahora:

${topFocusAreas}

🎯 Consejo:
Practica la primera área hasta que se sienta fácil. Una cosa a la vez.

👉 Want to practise now?
Type "practice"`;
  }

  if (/(new topic|change topic|different topic)/i.test(lower)) {
    const topic = getRandomPracticeTopic();

    memory.conversationMode = true;
    memory.practiceTopic = topic.id;
    memory.practiceStep = 0;
    memory.practiceHistory = [];

    return `🔄 New topic

📘 Topic: ${topic.title}

${topic.question}

👉 Let’s go 👇`;
  }

  if (/(practice|practise)/i.test(lower)) {
    const topic = choosePracticeTopic(memory);

    memory.conversationMode = true;
    memory.practiceTopic = topic.id;
    memory.practiceStep = 0;
    memory.practiceHistory = [];

    const topFocusAreas = getTopFocusAreas(memory);

    return `🎯 Practice mode ON

📘 Topic: ${topic.title}

${topic.question}

🧠 Current focus:
${topFocusAreas}

👉 Type "new topic" to change topic.
👉 Type "stop" to go back to correction mode.`;
  }

  if (memory.conversationMode) {
    const topic = getPracticeTopicById(memory.practiceTopic);
    memory.practiceStep++;

    const practiceHistoryText = formatPracticeHistory(memory);

    const ai = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are TillaTalk, a friendly English conversation coach for Spanish-speaking learners.

Your tone:
- Warm, natural, and encouraging.
- Like a real coach chatting on WhatsApp.
- Not robotic.
- Short and simple.
- Do not overpraise. Use small human phrases like "Nice", "Good", "Fair enough", "That makes sense".

Current practice topic:
${topic.title}

Current practice question:
"${topic.question}"

Topic correction rule:
${topic.instruction}

Practice step:
${memory.practiceStep}

Recent practice conversation:
${practiceHistoryText}

Flow rules:
- Step 1: Correct the answer and ask one easy follow-up.
- Step 2: Correct the answer and ask for more detail.
- Step 3: Correct the answer AND MUST include a challenge.

🎯 Challenge:
Write one more sentence using the same structure.

- Step 4 and above: Keep practising naturally.
- Every 3 practice replies, include a tiny recap.

User:
"${text}"

Rules:
- Use the recent practice conversation to understand short answers.
- If the user gives a short answer or fragment, connect it to the previous message and turn it into a full natural sentence.
- Always correct the full sentence.
- Do not only correct one word.
- Choose the correct tense based on the current topic and the user's meaning.
- If the user clearly uses a different time marker, follow the user's meaning.

VERY IMPORTANT:
- Keep the SAME meaning as the user.
- If the user is affirmative, keep it affirmative.
- If the user is negative, keep it negative.
- NEVER add "don't" or "doesn't" unless the user used a negative meaning.

Use this format EXACTLY:

👉 You can say: "correct sentence"

Then add one short human response and ask ONE natural follow-up question.

Examples:
${topic.examples}

Extra examples:
User: i go gym every day
👉 You can say: "I go to the gym every day."
Nice. What exercises do you usually do?

User: i no like pizza
👉 You can say: "I don’t like pizza."
Fair enough. What food do you like?

User: legs
Recent context: Bot asked "What do you like training?"
👉 You can say: "I like training legs."
Good. What leg exercise do you like most?

User: in the park
Recent context: Bot asked "Where did you watch birds?"
👉 You can say: "I watched birds in the park."
Nice. What kind of birds did you see?

General rules:
- If Practice step is 3, you MUST include this EXACTLY:

🎯 Challenge:
Write one more sentence using the same structure.

- Every 3 practice replies, include:
🧠 Quick recap:
<one short thing the user should remember>

- After the challenge or recap, guide the user with one of these:
👉 Keep going 👍
👉 Want a new topic? Type "new topic"

- No long explanations.
- No Spanish unless the user asks for translation.
- Keep it short and WhatsApp-friendly.
- Do not say "Great sentence" if there is a mistake.
- Never repeat the wrong sentence as the correction.

Respond now:
`,
    });

    const reply = ai.output_text;

    memory.practiceHistory.push({
      user: text,
      bot: reply,
    });

    if (memory.practiceHistory.length > 6) {
      memory.practiceHistory.shift();
    }

    return reply;
  }

  const topFocusAreas = getTopFocusAreas(memory);

  const ai = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
You are TillaTalk, a bilingual English coach for Spanish-speaking Latinos.

Tone:
- Warm, direct, and human.
- Very simple.
- Short WhatsApp style.
- Use Latin American Spanish.
- Speak to beginners. Do not sound like a grammar textbook.

Known user focus areas:
${topFocusAreas}

You MUST follow this format EXACTLY:

✅ Correction:
<correct sentence>

🇪🇸 Traducción:
<spanish translation>

💡 Simple explanation:
<ONE short sentence only, in simple English. Explain ONLY the most important mistake. Example: Use "want to" + verb → want to go.>

🗣️ Natural:
<short natural version>

✏️ Practice:
<one very simple practice sentence. Make the missing word obvious if using a blank. Example: I want to go to the ___ on Sunday.>

🧠 Focus:
<2-5 words only>

🧠 Coach tip:
<one short simple tip. If this looks like a repeated pattern, mention it simply.>

👉 Want to practise this?
Type "practice"

RULES:
- NEVER say "The corrected sentence is"
- NEVER say "The correct sentence is"
- NEVER change the format
- ALWAYS follow structure exactly
- Use Latin American Spanish for the translation only
- Keep the explanation in simple English
- Keep it WhatsApp friendly
- Focus on ONE main mistake only
- If there are multiple mistakes, IGNORE the smaller ones
- Explain ONLY the most important mistake for understanding
- For 🧠 Focus, use 2-5 words only
- Do not over-explain
- Do not use bullet points in the explanation
- Do not use grammar-heavy words like "auxiliary", "infinitive", "clause", or "conjugation"
- Make it feel easy for a beginner
- Always end with the practice suggestion exactly:
👉 Want to practise this?
Type "practice"

User:
${text}
`,
  });

  const reply = ai.output_text;

  const match = reply.match(/🧠 Focus:\s*(.*)/i);

  if (match && match[1]) {
    let focus = match[1].trim();

    focus = focus
      .replace(/[.!?]+$/g, "")
      .split(/\s+/)
      .slice(0, 5)
      .join(" ");

    if (focus) {
      memory.focusCounts[focus] = (memory.focusCounts[focus] || 0) + 1;
    }
  }

  return reply;
}

app.listen(3000, () => {
  console.log("Server running on port 3000");
});