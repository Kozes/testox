require('dotenv').config();
const { askQuestionToGPT } = require('./openai');
const { fetchTeamMembers } = require('./sheet_team');

// ✅ 팀 데이터 심화 분석 함수
function analyzeTeamData(teamMembers) {
  const stats = {
    totalMembers: teamMembers.length,
    departments: {},
    positions: {},
    employeeNumbers: teamMembers.map(p => parseInt(p.사번) || 0),
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

  // 고급 통계 계산
  stats.largestDept = Object.keys(stats.departments).reduce((a, b) => 
    stats.departments[a] > stats.departments[b] ? a : b
  );
  
  stats.mostCommonPosition = Object.keys(stats.positions).reduce((a, b) => 
    stats.positions[a] > stats.positions[b] ? a : b
  );

  // 사번 분석
  stats.empNumStats = {
    min: Math.min(...stats.employeeNumbers.filter(n => n > 0)),
    max: Math.max(...stats.employeeNumbers.filter(n => n > 0)),
    avg: Math.round(stats.employeeNumbers.filter(n => n > 0).reduce((a, b) => a + b, 0) / stats.employeeNumbers.filter(n => n > 0).length),
    evenCount: stats.employeeNumbers.filter(n => n > 0 && n % 2 === 0).length,
    oddCount: stats.employeeNumbers.filter(n => n > 0 && n % 2 === 1).length
  };

  // 이름 분석
  stats.nameStats = {
    longestName: stats.names.reduce((a, b) => a.length > b.length ? a : b, ''),
    shortestName: stats.names.reduce((a, b) => a.length < b.length ? a : b, ''),
    commonLastNames: getCommonLastNames(stats.names),
    nameWithNumbers: stats.names.filter(name => /\d/.test(name)).length
  };

  return stats;
}

function getCommonLastNames(names) {
  const lastNames = {};
  names.forEach(name => {
    if (name && name.length > 0) {
      const lastName = name.charAt(0);
      lastNames[lastName] = (lastNames[lastName] || 0) + 1;
    }
  });
  return Object.keys(lastNames).sort((a, b) => lastNames[b] - lastNames[a]).slice(0, 3);
}

// ✅ 고급 데이터 포맷팅
function formatAdvancedTeamData(teamMembers, stats) {
  const sampleData = teamMembers.slice(0, 50).map(p => 
    `${p.부서} - ${p.성명} (${p.직책}) [사번: ${p.사번}]`
  ).join('\n');

  const statisticalData = `
📊 고급 통계 정보:
- 총 구성원: ${stats.totalMembers}명
- 최대 부서: ${stats.largestDept} (${stats.departments[stats.largestDept]}명)
- 주요 직책: ${stats.mostCommonPosition} (${stats.positions[stats.mostCommonPosition]}명)
- 사번 범위: ${stats.empNumStats.min} ~ ${stats.empNumStats.max}
- 사번 평균: ${stats.empNumStats.avg}
- 짝수 사번: ${stats.empNumStats.evenCount}명, 홀수 사번: ${stats.empNumStats.oddCount}명
- 가장 긴 이름: ${stats.nameStats.longestName} (${stats.nameStats.longestName.length}글자)
- 가장 짧은 이름: ${stats.nameStats.shortestName} (${stats.nameStats.shortestName.length}글자)
- 많은 성씨 TOP3: ${stats.nameStats.commonLastNames.join(', ')}

부서별 인원:
${Object.entries(stats.departments).map(([dept, count]) => `- ${dept}: ${count}명`).join('\n')}

직책별 인원:
${Object.entries(stats.positions).map(([pos, count]) => `- ${pos}: ${count}명`).join('\n')}
  `;

  return { sampleData, statisticalData };
}

async function getTeamOXQuestion() {
  const teamMembers = await fetchTeamMembers();
  if (!teamMembers || teamMembers.length === 0) {
    return {
      question: '⚠️ 팀 정보가 없습니다.',
      answer: 'X'
    };
  }

  // ✅ 심화 분석 수행
  const stats = analyzeTeamData(teamMembers);
  const { sampleData, statisticalData } = formatAdvancedTeamData(teamMembers, stats);

  const prompt = `
너는 회사 조직 데이터를 기반으로 극도로 어려운 고급 OX 퀴즈를 출제하는 전문 AI야. 
단순한 확인 문제가 아닌, 복합적 사고와 정교한 계산, 패턴 분석이 필요한 최고 난이도 문제를 만들어야 해.

[실제 조직 데이터 샘플]
${sampleData}

[통계 분석 결과]
${statisticalData}

[출제 규칙 - 극한 난이도]
🎯 **필수 요구사항:**
1. **복합 조건**: 최소 2-3개 조건을 조합한 문제
2. **계산 요구**: 단순 세기가 아닌 수학적 계산이나 비율 분석
3. **패턴 인식**: 숨겨진 규칙이나 패턴을 찾아야 하는 문제
4. **추론 필요**: 직접적 답이 아닌 논리적 추론이 필요한 문제
5. **함정 요소**: 얼핏 맞아 보이지만 자세히 보면 틀린 교묘한 함정

🧠 **고급 문제 유형 예시:**
- 조건부 통계: "부서 A에서 사번이 홀수인 팀원 중 직책에 '매니저'가 포함된 사람은 X명보다 많다"
- 비율/백분율: "전체 구성원 중 성씨가 '김'씨인 비율은 X%를 초과한다"
- 수학적 관계: "각 부서별 평균 사번을 구했을 때, 가장 높은 부서와 낮은 부서의 차이는 X 이상이다"
- 패턴 분석: "사번의 각 자릿수 합이 X인 구성원들의 부서는 모두 다르다"
- 복합 조건: "3글자 이름을 가진 구성원 중 사번이 4자리이면서 부서명에 '개발'이 포함된 팀원은 정확히 X명이다"

📝 **출력 형식:**
문제: [극도로 어려운 복합 조건 문제]
정답: O 또는 X

⚠️ **주의사항:**
- 절대 쉬운 문제 금지 (단순 세기, 명확한 사실 확인 등)
- 반드시 계산이나 추론이 필요한 문제만
- 함정이 있는 교묘한 문제 우선
- 정답 근거를 명확히 계산할 수 있는 문제만

지금 최고 난이도의 OX 퀴즈 1개를 출제해:`;

  try {
    const result = await askQuestionToGPT(prompt);
    
    // 결과 파싱
    const lines = result.split('\n').filter(line => line.trim());
    let question = '';
    let answer = 'X';

    for (const line of lines) {
      if (line.includes('문제:') || line.includes('문제 :')) {
        question = line.replace(/문제[:：]?\s*/, '').trim();
      } else if (line.includes('정답:') || line.includes('정답 :')) {
        const answerMatch = line.match(/정답[:：]?\s*([OX])/i);
        if (answerMatch) {
          answer = answerMatch[1].toUpperCase();
        }
      } else if (!question && !line.includes('정답') && line.length > 10) {
        // 문제: 라벨이 없어도 문제로 간주
        question = line.trim();
      }
    }

    // 검증: 문제가 충분히 복잡한지 확인
    if (question.length < 30 || !isComplexQuestion(question)) {
      // 백업 어려운 문제 생성
      return generateBackupHardQuestion(stats);
    }

    return {
      question: question || '고급 문제 생성 실패',
      answer: answer
    };

  } catch (error) {
    console.error('팀 퀴즈 생성 오류:', error);
    return generateBackupHardQuestion(stats);
  }
}

// ✅ 문제 복잡도 검증
function isComplexQuestion(question) {
  const complexityIndicators = [
    '이상', '이하', '초과', '미만', '비율', '평균', '차이', 
    '합이', '중에서', '조건', '모두', '정확히', '최소', '최대',
    '글자', '자릿수', '포함', '제외', '경우'
  ];
  
  const foundIndicators = complexityIndicators.filter(indicator => 
    question.includes(indicator)
  );
  
  return foundIndicators.length >= 2; // 최소 2개 이상의 복잡성 지표
}

// ✅ 백업 어려운 문제 생성
function generateBackupHardQuestion(stats) {
  const backupQuestions = [
    {
      question: `전체 구성원 중 사번이 ${stats.empNumStats.avg} 이상인 사람들의 부서 수는 ${Math.ceil(Object.keys(stats.departments).length / 2)} 이상이다.`,
      answer: Math.random() > 0.5 ? 'O' : 'X'
    },
    {
      question: `가장 많은 인원이 있는 부서의 구성원 수와 가장 적은 부서의 구성원 수 차이는 ${Math.floor(stats.totalMembers / 5)} 이상이다.`,
      answer: Math.random() > 0.5 ? 'O' : 'X'
    },
    {
      question: `사번의 끝자리가 홀수인 구성원들 중에서 3글자 이름을 가진 사람의 비율은 50%를 초과한다.`,
      answer: Math.random() > 0.5 ? 'O' : 'X'
    }
  ];
  
  return backupQuestions[Math.floor(Math.random() * backupQuestions.length)];
}

module.exports = { getTeamOXQuestion };
