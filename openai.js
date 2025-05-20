const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateOXQuestion = async () => {
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `넌 OX 퀴즈 출제자야. 반드시 아래 형식으로 출력해.

문제: (OX 퀴즈 문장 한 줄)
정답: O 또는 X`
      }
    ]
  });

  const text = res.choices[0].message.content.trim();

  const questionMatch = text.match(/문제[:：]?\s*(.+)/);
  const answerMatch = text.match(/정답[:：]?\s*([OX])/i);

  let question = '';
  if (questionMatch && questionMatch[1]) {
    question = questionMatch[1].trim();
  } else {
    const lines = text.split('\\n').filter(Boolean);
    question = lines.find(line => !line.includes('정답')) || '질문 없음';
  }

  const answer = answerMatch ? answerMatch[1].toUpperCase() : 'X';

  return {
    question,
    answer
  };
};

const askQuestionToGPT = async (prompt) => {
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: '너는 OX 퀴즈 AI야. 정답을 유추하거나 판단하지 말고, 중립적인 일반 질문에만 답해.'
      },
      { role: 'user', content: prompt }
    ]
  });

  return res.choices[0].message.content;
};

module.exports = {
  generateOXQuestion,
  askQuestionToGPT
};