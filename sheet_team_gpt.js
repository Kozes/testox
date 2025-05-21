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
너는 회사 팀 데이터를 기반으로 고급스럽고 교묘한 OX 퀴즈를 출제하는 AI야. 퀴즈는 깔끔한 문장, 중간 이상의 난이도, 그리고 통계 기반의 내용을 포함할 수 있어야 해.

[입력 데이터]
${formatTeamDataForPrompt(teamMembers)}

[출제 규칙]
- 실제 데이터 기반으로 문제를 만들어야 함
- 정답은 반드시 O 또는 X 중 하나로 명시
- 문장은 완성도 있게 끝나야 하며, 문법적으로 자연스럽고 이해하기 쉬워야 함
- 단순한 확인이 아닌 유추나 비교, 통계적 판단을 요구하는 질문을 허용
- 문제는 반드시 하나만 생성할 것
- 마지막 줄에는 반드시 "정답: O" 또는 "정답: X"라고 써라

예시 출력 형식:
문제: Cloud Expert팀에는 사번이 11000번 이상인 팀원이 2명 이상 있다.
정답: O

문제: 가장 많은 인원이 소속된 부서는 CS이다.
정답: O

문제: 사번의 끝자리가 9인 구성원은 총 3명이다.
정답: X

문제: 사번의 합이 22188인 구성원은 허준혁과 황시은이다.
정답: O

OX 퀴즈:`;

  const result = await askQuestionToGPT(prompt);
  const questionMatch = result.match(/(?:문제[:：]?\s*)?(.+?)(?:\n|$)/);
  const answerMatch = result.match(/정답[:：]?\s*([OX])/i);

  return {
    question: questionMatch ? questionMatch[1].trim() : '질문 없음',
    answer: answerMatch ? answerMatch[1].toUpperCase() : 'X'
  };
}

module.exports = { getTeamOXQuestion };