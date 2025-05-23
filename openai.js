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
넌 극한 난이도의 상식 기반 OX 퀴즈 출제자야. 단순한 상식이 아닌, 깊이 있는 지식과 복합적 사고를 요구하는 최고 난이도 문제를 만들어야 해.

🎯 **극한 난이도 출제 규칙:**
1. **복합 지식 결합**: 2-3개 분야의 지식을 조합한 문제
2. **수치/통계 포함**: 정확한 숫자나 비율, 순위 등이 포함된 문제
3. **시간적 맥락**: 특정 연도나 시대적 배경이 필요한 문제
4. **비교/대조**: 여러 대상을 비교하거나 상대적 관계를 묻는 문제
5. **함정 요소**: 얼핏 맞아 보이지만 자세히 따져봐야 하는 교묘한 문제
6. **전문 지식**: 일반인도 알 수 있지만 깊이 있는 사고가 필요한 문제

🧠 **고급 문제 유형 예시:**
- 역사+지리: "조선시대 한양의 인구는 에도시대 에도보다 많았으며, 이는 당시 세계 10대 도시 중 하나였다"
- 과학+수학: "지구의 자전 속도가 1% 빨라진다면 하루는 현재보다 약 14.4분 짧아진다"
- 문화+경제: "2023년 기준 한국의 1인당 GDP는 일본을 추월했으며, 이는 아시아에서 3번째 순위이다"
- 언어+역사: "한글 창제 당시 자음은 17개였으나, 현재 사용되는 기본 자음은 14개로 3개가 사라졌다"
- 생물+화학: "인간의 DNA 중 실제로 단백질을 만드는 부분은 전체의 약 1.5%이며, 나머지는 정크 DNA라고 불린다"

❌ **금지 문제 유형:**
- 단순 사실 확인: "서울이 대한민국의 수도다"
- 너무 쉬운 상식: "사람은 호흡을 한다"
- 단일 분야 기초 지식: "1+1=2이다"

✅ **필수 요구사항:**
- 문제 길이 최소 25글자 이상
- 최소 2개 이상의 구체적 정보 포함
- 추론이나 계산이 필요한 요소 포함
- 함정이나 미묘한 차이점 존재

📝 **출력 형식:**
문제: [극도로 어려운 복합 지식 문제]
정답: O 또는 X

지금 최고 난이도의 상식 OX 퀴즈 1개를 출제해:`
      }
    ]
  });
  
  const text = res.choices[0].message.content.trim();
  
  // 더 정교한 파싱
  let question = '';
  let answer = 'X';
  
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.includes('문제:') || trimmedLine.includes('문제 :')) {
      question = trimmedLine.replace(/문제[:：]?\s*/, '').trim();
    } else if (trimmedLine.includes('정답:') || trimmedLine.includes('정답 :')) {
      const answerMatch = trimmedLine.match(/정답[:：]?\s*([OX])/i);
      if (answerMatch) {
        answer = answerMatch[1].toUpperCase();
      }
    } else if (!question && !trimmedLine.includes('정답') && trimmedLine.length > 20) {
      // 문제: 라벨이 없어도 충분히 긴 문장은 문제로 간주
      question = trimmedLine;
    }
  }
  
  // 문제 품질 검증
  if (!isHighQualityQuestion(question)) {
    // 백업 고난도 문제 제공
    const backupQuestion = getBackupHardQuestion();
    return backupQuestion;
  }
  
  return {
    question: question || '고급 문제 생성 실패',
    answer: answer
  };
};

// ✅ 문제 품질 검증 함수
function isHighQualityQuestion(question) {
  if (!question || question.length < 25) return false;
  
  // 고급 문제 지표
  const complexityIndicators = [
    // 수치 관련
    '약', '대략', '이상', '이하', '초과', '미만', '%', '번째', '위', 
    '배', '배수', '분의', '년', '세기', '시대',
    
    // 비교 관련  
    '보다', '가장', '최초', '최후', '최대', '최소', '높', '낮', '크', '작',
    
    // 복합 지식
    '당시', '기준', '경우', '반면', '그러나', '하지만', '또한', '뿐만 아니라',
    
    // 전문성
    'GDP', 'DNA', '인구', '면적', '속도', '온도', '압력', '농도', '비율'
  ];
  
  const foundIndicators = complexityIndicators.filter(indicator => 
    question.includes(indicator)
  );
  
  // 숫자가 포함되어 있는지 확인
  const hasNumbers = /\d/.test(question);
  
  // 복잡성 지표 2개 이상 + 숫자 포함 또는 복잡성 지표 3개 이상
  return (foundIndicators.length >= 2 && hasNumbers) || foundIndicators.length >= 3;
}

// ✅ 백업 고난도 문제
function getBackupHardQuestion() {
  const hardQuestions = [
    {
      question: "한국의 출생률이 0.78명(2022년 기준)으로 OECD 국가 중 최하위이며, 이는 인구 유지를 위한 대체출산율 2.1명의 37% 수준이다.",
      answer: "O"
    },
    {
      question: "지구의 자전축이 23.5도 기울어져 있는 것은 약 45억 년 전 화성 크기의 천체 충돌 때문이며, 이 충돌로 달도 함께 생성되었다.",
      answer: "O"
    },
    {
      question: "인간의 뇌는 체중의 2%에 불과하지만 전체 에너지의 20%를 소모하며, 이는 다른 포유류의 뇌 에너지 소모량의 3배에 해당한다.",
      answer: "O"
    },
    {
      question: "비트코인 1개를 채굴하는데 필요한 전력량은 평균 가정의 약 30일분 전력 사용량과 같으며, 이는 전 세계 전력 소비의 0.5%에 해당한다.",
      answer: "O"
    },
    {
      question: "한글의 자음 'ㅋ'과 'ㅌ'은 각각 중국어의 'k'와 't' 음을 표현하기 위해 만들어졌으며, 이는 당시 명나라와의 외교 문서 작성을 위한 것이었다.",
      answer: "X"
    },
    {
      question: "아마존 열대우림이 1년간 흡수하는 이산화탄소는 약 20억 톤으로, 이는 전 세계 연간 탄소 배출량의 5%에 해당하여 '지구의 허파'라고 불린다.",
      answer: "X"
    }
  ];
  
  return hardQuestions[Math.floor(Math.random() * hardQuestions.length)];
}

// ✅ 강화된 질문 차단 기능
const askQuestionToGPT = async (prompt, currentQuestion = '', gameStatus = 'waiting') => {
  // ✅ 게임 진행 중이고 현재 문제가 있을 때 차단 로직
  if (gameStatus === 'active' && currentQuestion) {
    const isBlocked = checkIfQuestionBlocked(prompt, currentQuestion);
    if (isBlocked) {
      return "🚫 현재 진행 중인 퀴즈 문제에 대한 질문은 답변드릴 수 없습니다! 퀴즈가 끝난 후에 물어보세요. 😊";
    }
  }

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `
당신은 SK AX OX 퀴즈의 AI 어시스턴트입니다.

⚠️ 중요 규칙:
- 현재 진행 중인 퀴즈 문제에 대해서는 절대 답변하지 마세요
- 정답, 힌트, 관련 정보를 제공하지 마세요  
- 우회적인 질문에도 답변하지 마세요
- 퀴즈와 관련 없는 일반적인 질문만 답변하세요

${gameStatus === 'active' ? '현재 퀴즈가 진행 중이므로 공정한 게임을 위해 퀴즈 관련 질문은 거부해주세요.' : ''}

친근하고 도움이 되는 AI 어시스턴트로서 일반적인 질문에 답변해주세요.
`
      },
      { role: 'user', content: prompt }
    ]
  });
  
  return res.choices[0].message.content;
};

// ✅ 질문 차단 여부 검사 함수
function checkIfQuestionBlocked(userPrompt, currentQuestion) {
  const userText = userPrompt.toLowerCase();
  const questionText = currentQuestion.toLowerCase();
  
  // 1. 직접적인 정답 요청 키워드
  const directAnswerKeywords = [
    '정답', '답', '맞', '틀', '정답이', '답이', '답안',
    'o인가', 'x인가', '참인가', '거짓인가', 
    '맞나', '틀렸나', '맞니', '틀렸니',
    '정답 알려', '답 알려', '답변해', '풀어',
    'ox', 'o x', '옳', '그름', '참', '거짓'
  ];
  
  // 2. 현재 문제의 핵심 키워드 추출
  const questionKeywords = extractQuestionKeywords(questionText);
  
  // 3. 우회적 질문 패턴
  const indirectPatterns = [
    '이거 어떻게 생각해',
    '이것에 대해',
    '어떤 것이',
    '무엇이',
    '확인해',
    '검증해',
    '사실인가',
    '맞는 말인가',
    '어떻게 봐'
  ];
  
  // 4. 차단 조건 검사
  
  // 직접적인 정답 요청
  if (directAnswerKeywords.some(keyword => userText.includes(keyword))) {
    return true;
  }
  
  // 현재 문제 키워드가 포함된 경우
  if (questionKeywords.some(keyword => userText.includes(keyword))) {
    return true;
  }
  
  // 우회적 질문 + 문제 관련 키워드 조합
  const hasIndirectPattern = indirectPatterns.some(pattern => userText.includes(pattern));
  const hasQuestionContext = questionKeywords.some(keyword => userText.includes(keyword));
  
  if (hasIndirectPattern && hasQuestionContext) {
    return true;
  }
  
  return false;
}

// ✅ 문제에서 핵심 키워드 추출
function extractQuestionKeywords(questionText) {
  // 한국어 불용어
  const stopWords = [
    '은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '만', '까지', 
    '부터', '에서', '으로', '로', '에게', '한테', '께', '인가요', '인가', '일까요', 
    '일까', '인지', '한지', '있다', '없다', '이다', '아니다', '하다', '되다', 
    '것', '수', '때', '곳', '말', '일', '년', '월', '일', '시간'
  ];
  
  // 특수문자 제거 및 단어 분리
  const words = questionText
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 2) // 2글자 이상
    .filter(word => !stopWords.includes(word))
    .filter(word => !/^\d+$/.test(word)) // 순수 숫자 제외
    .slice(0, 8); // 최대 8개 키워드
  
  return words;
}

module.exports = {
  generateOXQuestion,
  askQuestionToGPT,
  checkIfQuestionBlocked // ✅ 테스트용으로 export
};
