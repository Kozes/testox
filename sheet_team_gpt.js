require('dotenv').config();
const { askQuestionToGPT } = require('./openai');
const { fetchTeamMembers } = require('./sheet_team'); // 너가 쓰던 파일 이름 기준

function formatTeamDataForPrompt(teamMembers) {
  return teamMembers
    .slice(0, 15) // GPT prompt가 너무 길지 않게 일부만 사용
    .map(p => `${p.부서} - ${p.성명} (${p.직책})`)
    .join('\n');
}

async function getTeamOXQuestion() {
  const teamMembers = await fetchTeamMembers();

  if (!teamMembers || teamMembers.length === 0) {
    return {
      question: '⚠️ 팀 정보가 없습니다.',
      answer: 'X'
    };
  }

  const prompt = `
다음은 회사 팀 구성원 데이터입니다. 아래 정보를 참고하여 OX 퀴즈 문제 1개를 만들어주세요.

[데이터]
${formatTeamDataForPrompt(teamMembers)}

[규칙]
- 퀴즈는 데이터 기반이어야 함 (거짓이면 정답은 X, 사실이면 O)
- 문제는 간단한 OX 문장 1개만 생성
- 마지막 줄에 반드시 "정답: O" 또는 "정답: X" 형식으로 표시

OX 퀴즈:
`;

  const result = await askQuestionToGPT(prompt);
  const questionMatch = result.match(/(?:문제[:：]?\s*)?(.+?)(?:\n|$)/);
  const answerMatch = result.match(/정답[:：]?\s*([OX])/i);

  return {
    question: questionMatch ? questionMatch[1].trim() : '질문 없음',
    answer: answerMatch ? answerMatch[1].toUpperCase() : 'X'
  };
}

module.exports = { getTeamOXQuestion };