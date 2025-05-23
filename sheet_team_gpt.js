require('dotenv').config();
const { askQuestionToGPT } = require('./openai');
const { fetchTeamMembers } = require('./sheet_team');

// ✅ 팀 데이터 분석 함수
function analyzeTeamData(teamMembers) {
  const stats = {
    totalMembers: teamMembers.length,
    departments: {},
    positions: {},
    employeeNumbers: teamMembers.map(p => parseInt(p.사번) || 0).filter(n => n > 0),
    names: teamMembers.map(p => p.성명),
    deptPositionCombos: []
  };

  // 부서별, 직책별 통계
  teamMembers.forEach(member => {
    const dept = member.부서 || '미정';
    const position = member.직책 || '미정';
    
    stats.departments[dept] = (stats.departments[dept] || 0) + 1;
    stats.positions[position] = (stats.positions[position] || 0) + 1;
    stats.deptPositionCombos.push(`${dept}-${position}`);
  });

  // 상위 부서들
  stats.topDepartments = Object.entries(stats.departments)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  // 상위 직책들
  stats.topPositions = Object.entries(stats.positions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 사번 분석
  if (stats.employeeNumbers.length > 0) {
    stats.empNumStats = {
      min: Math.min(...stats.employeeNumbers),
      max: Math.max(...stats.employeeNumbers),
      avg: Math.round(stats.employeeNumbers.reduce((a, b) => a + b, 0) / stats.employeeNumbers.length),
      count: stats.employeeNumbers.length
    };
  }

  // 이름 분석
  stats.nameStats = {
    threeCharNames: stats.names.filter(name => name && name.length === 3).length,
    twoCharNames: stats.names.filter(name => name && name.length === 2).length,
    fourCharNames: stats.names.filter(name => name && name.length === 4).length,
    totalNames: stats.names.filter(name => name && name.length > 0).length
  };

  // 성씨 분석
  const lastNames = {};
  stats.names.forEach(name => {
    if (name && name.length > 0) {
      const lastName = name.charAt(0);
      lastNames[lastName] = (lastNames[lastName] || 0) + 1;
    }
  });
  stats.lastNameStats = Object.entries(lastNames)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return stats;
}

// ✅ 검증 가능한 문제 생성
function generateVerifiableQuestions(stats) {
  const questions = [];
  
  // 1. 총 인원 관련
  questions.push({
    question: `전체 구성원은 ${stats.totalMembers}명이다.`,
    answer: 'O',
    explanation: `실제 데이터에 따르면 전체 구성원은 정확히 ${stats.totalMembers}명입니다.`
  });
  
  questions.push({
    question: `전체 구성원은 ${stats.totalMembers + 10}명 이상이다.`,
    answer: 'X',
    explanation: `실제 전체 구성원은 ${stats.totalMembers}명으로, ${stats.totalMembers + 10}명보다 적습니다.`
  });

  // 2. 부서 관련
  if (stats.topDepartments.length > 0) {
    const [topDept, topCount] = stats.topDepartments[0];
    questions.push({
      question: `${topDept} 부서가 가장 많은 인원(${topCount}명)을 보유하고 있다.`,
      answer: 'O',
      explanation: `${topDept} 부서는 ${topCount}명으로 가장 많은 인원을 보유한 부서입니다.`
    });
    
    questions.push({
      question: `${topDept} 부서의 인원은 전체의 50% 이상이다.`,
      answer: (topCount / stats.totalMembers) >= 0.5 ? 'O' : 'X',
      explanation: `${topDept} 부서는 ${topCount}명으로 전체의 ${Math.round((topCount / stats.totalMembers) * 100)}%입니다.`
    });
  }

  // 3. 직책 관련
  if (stats.topPositions.length > 0) {
    const [topPos, posCount] = stats.topPositions[0];
    questions.push({
      question: `${topPos} 직책을 가진 구성원이 ${posCount}명이다.`,
      answer: 'O',
      explanation: `실제로 ${topPos} 직책을 가진 구성원은 정확히 ${posCount}명입니다.`
    });
  }

  // 4. 이름 관련
  if (stats.nameStats.totalNames > 0) {
    const threeCharRatio = Math.round((stats.nameStats.threeCharNames / stats.nameStats.totalNames) * 100);
    questions.push({
      question: `3글자 이름을 가진 구성원이 전체의 ${threeCharRatio}% 이상이다.`,
      answer: 'O',
      explanation: `3글자 이름을 가진 구성원은 ${stats.nameStats.threeCharNames}명으로 전체의 ${threeCharRatio}%입니다.`
    });
    
    questions.push({
      question: `2글자 이름을 가진 구성원이 3글자 이름을 가진 구성원보다 많다.`,
      answer: stats.nameStats.twoCharNames > stats.nameStats.threeCharNames ? 'O' : 'X',
      explanation: `2글자 이름: ${stats.nameStats.twoCharNames}명, 3글자 이름: ${stats.nameStats.threeCharNames}명입니다.`
    });
  }

  // 5. 성씨 관련
  if (stats.lastNameStats.length > 0) {
    const [topLastName, lastNameCount] = stats.lastNameStats[0];
    questions.push({
      question: `'${topLastName}'씨가 가장 많으며, ${lastNameCount}명이다.`,
      answer: 'O',
      explanation: `'${topLastName}'씨는 ${lastNameCount}명으로 가장 많은 성씨입니다.`
    });
  }

  // 6. 부서 수 관련
  const deptCount = Object.keys(stats.departments).length;
  questions.push({
    question: `전체 부서는 ${deptCount}개이다.`,
    answer: 'O',
    explanation: `데이터에 나타난 전체 부서는 정확히 ${deptCount}개입니다.`
  });

  // 7. 사번 관련
  if (stats.empNumStats && stats.empNumStats.count > 0) {
    questions.push({
      question: `사번이 등록된 구성원은 ${stats.empNumStats.count}명이며, 평균 사번은 ${stats.empNumStats.avg}이다.`,
      answer: 'O',
      explanation: `사번이 등록된 구성원은 ${stats.empNumStats.count}명이고, 평균 사번은 ${stats.empNumStats.avg}입니다.`
    });
  }

  return questions;
}

async function getTeamOXQuestion() {
  const teamMembers = await fetchTeamMembers();
  if (!teamMembers || teamMembers.length === 0) {
    return {
      question: '⚠️ 팀 정보가 없습니다.',
      answer: 'X',
      explanation: '팀 정보를 불러올 수 없습니다.'
    };
  }

  // 데이터 분석
  const stats = analyzeTeamData(teamMembers);
  
  // 검증 가능한 문제들 생성
  const verifiableQuestions = generateVerifiableQuestions(stats);
  
  // 랜덤하게 하나 선택
  const selected = verifiableQuestions[Math.floor(Math.random() * verifiableQuestions.length)];
  
  // GPT를 통해 문제를 좀 더 자연스럽게 다듬기 (선택사항)
  try {
    const prompt = `
다음 OX 퀴즈 문제를 자연스럽고 명확하게 다듬어주세요:
원본 문제: ${selected.question}
정답: ${selected.answer}

요구사항:
- 의미는 정확히 동일하게 유지
- 숫자나 통계는 절대 변경하지 말 것
- 더 자연스러운 한국어 표현으로 수정
- 문제만 출력 (정답은 출력하지 말 것)`;

    const result = await askQuestionToGPT(prompt);
    const refinedQuestion = result.trim();
    
    return {
      question: refinedQuestion || selected.question,
      answer: selected.answer,
      explanation: selected.explanation
    };
    
  } catch (error) {
    console.error('문제 다듬기 실패:', error);
    return selected;
  }
}

module.exports = { getTeamOXQuestion };
