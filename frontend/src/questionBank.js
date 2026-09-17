export const IELTS_QUESTIONS = {
  'Part 1': [
    "Do you work or are you a student? What do you find most rewarding about it?",
    "Where is your hometown located, and what do you like most about living there?",
    "How often do you listen to music, and does it help you concentrate or relax?",
    "Do you prefer using public transport or private vehicles? Why?",
    "How has technology changed the way you communicate with family and friends?",
    "What kind of books do you enjoy reading in your spare time?",
    "Do you enjoy cooking for yourself or others? What is your signature dish?",
    "How does the weather in your country affect your daily mood and productivity?",
    "Did you enjoy playing sports as a child, and do you still stay active today?",
    "Do you prefer shopping online or visiting physical retail stores? Why?"
  ],
  'Part 2': [
    `Describe a memorable journey or trip you went on.
You should say:
• Where you went and who accompanied you
• How you traveled there
• What activities you engaged in
and explain why this particular journey remains so memorable to you.`,

    `Describe an ambitious person you know and admire.
You should say:
• Who this person is
• What their main ambitions or goals are
• What steps they are taking to achieve them
and explain why you admire their ambition and drive.`,

    `Describe an important skill you learned recently.
You should say:
• What the skill is
• Why you decided to learn it
• How you went about learning it
and explain how this skill has helped you in your everyday life or studies.`,

    `Describe a piece of technology (hardware or software) that you find indispensable.
You should say:
• What device or application it is
• When and how often you use it
• What key problems it solves for you
and explain how your routine would change if you no longer had access to it.`,

    `Describe an environmental problem in your region or country that needs urgent attention.
You should say:
• What the problem is and what causes it
• Who is affected by it
• What measures are currently being taken
and explain what you think individuals or governments should do to solve it.`
  ],
  'Part 3': [
    "To what extent do you think artificial intelligence will reshape future employment and education?",
    "In your view, should governments prioritize economic development or environmental preservation?",
    "How has social media influenced the quality of interpersonal relationships in modern society?",
    "Do you believe traditional educational institutions will eventually be replaced by online learning platforms?",
    "Why do you think rapid urbanization is occurring worldwide, and what challenges does it bring to public infrastructure?",
    "How important is it for nations to preserve their historical heritage in an increasingly globalized world?"
  ]
};

export const getRandomQuestion = (part) => {
  const list = IELTS_QUESTIONS[part] || IELTS_QUESTIONS['Part 1'];
  const randomIndex = Math.floor(Math.random() * list.length);
  return list[randomIndex];
};
