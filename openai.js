const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ 기본 OX 문제 출제
const generateOXQuestion = async () => {
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: '넌 OX 퀴즈 출제자야. 어려운 상식 문제를 하나 만들고 마지막 줄에 반드시 "정답: O" 또는 "정답: X"라고 명시해.'
      }
    ]
  });

  const text = res.choices[0].message.content.trim();

  // 정답 추출
  const answerMatch = text.match(/정답:\s*(O|X)/);
  const answer = answerMatch ? answerMatch[1] : 'O';

  // 문제 텍스트에서 정답 문장 제거 (마지막 줄 제거)
  const lines = text.split('\n').filter(line => !line.includes('정답:'));

  return {
    question: lines.join('\n').trim(),
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
