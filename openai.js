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
