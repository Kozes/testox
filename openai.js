const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ 기본 OX 문제 출제 (정답: 정확하게 추출 + fallback 처리)
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

  // 문제와 정답 분리
  const questionMatch = text.match(/문제[:：]?\s*(.+)/); // "문제:"로 시작하는 경우
  const answerMatch = text.match(/정답[:：]?\s*([OX])/i); // "정닐" 회피 + 대소문자 허용

  const question = questionMatch
    ? questionMatch[1].trim()
    : text.replace(/정답[:：]?\s*[OX]/i, '').trim(); // fallback: 정답 줄 제거

  const answer = answerMatch ? answerMatch[1].toUpperCase() : 'X'; // fallback 정답

  return {
    question,
    answer
  };
};

// ✅ 사용자 질문 응답 (정답 유추 차단)
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
