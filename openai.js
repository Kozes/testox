const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateOXQuestion = async () => {
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `
넌 상식 기반 OX 퀴즈 출제자야. 쉽고 단순한 문장이 아니라, 일반 지식 중 통계적/사실 기반의 고급 OX 문제를 만들어.

[출제 규칙]
- 너무 쉬운 문장은 피하고, 유추력이나 넓은 일반 지식을 요구하는 중상급 난이도의 문장을 생성
- 반드시 OX 퀴즈 한 문장만 생성
- 마지막 줄은 반드시 "정답: O" 또는 "정답: X" 형식으로 표시

예시 출력 형식:
문제: 대한민국의 수도는 서울이며, 국보 1호는 숭례문이다.
정답: O

OX 퀴즈:`
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
    const lines = text.split('\n').filter(Boolean);
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