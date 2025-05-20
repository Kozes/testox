const express = require('express');
const app = express();
const path = require('path');
const { generateOXQuestion, askQuestionToGPT } = require('./openai');
require('dotenv').config();

const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ 게임 상태
let gameState = {
  round: 0,
  currentQuestion: '',
  currentAnswer: '',
  participants: [],
  status: 'waiting',
  lastSurvivors: ''
};

// ✅ 게임 시작
app.post('/admin/start', async (req, res) => {
  gameState.round = 1;
  gameState.participants = [];

  const q = await generateOXQuestion();
  gameState.currentQuestion = q.question;
  gameState.currentAnswer = q.answer;
  gameState.status = 'active';
  gameState.lastSurvivors = '';

  res.json({ message: '게임 시작됨', question: q.question });
});

// ✅ 다음 문제 출제
app.post('/admin/next', async (req, res) => {
  gameState.round += 1;
  gameState.participants = [];

  const q = await generateOXQuestion();
  gameState.currentQuestion = q.question;
  gameState.currentAnswer = q.answer;
  gameState.status = 'active';
  gameState.lastSurvivors = '';

  res.json({ message: `문제 ${gameState.round} 출제됨`, question: q.question });
});

// ✅ 정답 제출 (생존자만 가능)
app.post('/submit', (req, res) => {
  const { name, answer } = req.body;

  if (gameState.status !== 'active') {
    return res.status(403).json({ message: '현재 응답할 수 없습니다.' });
  }

  const submittedName = name.trim().toLowerCase();

  if (gameState.participants.find(p => p.name.trim().toLowerCase() === submittedName)) {
    return res.status(409).json({ message: '이미 제출하셨습니다.' });
  }

  if (gameState.round > 1) {
    const survivors = gameState.lastSurvivors
      .split(',')
      .map(n => n.trim().toLowerCase())
      .filter(n => n); // 빈 문자열 제거

    if (!survivors.includes(submittedName)) {
      return res.status(403).json({ message: '생존자만 제출할 수 있습니다.' });
    }
  }

  gameState.participants.push({ name: name.trim(), answer });
  res.sendStatus(200);
});

// ✅ 라운드 종료
app.post('/admin/end', (req, res) => {
  const survivors = gameState.participants.filter(p =>
    p.answer.trim().toUpperCase() === gameState.currentAnswer.trim().toUpperCase()
  );

  const names = survivors.map(s => s.name.trim()).filter(n => n); // 공백 제거 + 빈값 제외

  gameState.lastSurvivors = names.join(', ');
  gameState.status = 'ended';

  console.log('✅ 생존자:', gameState.lastSurvivors); // 확인용 로그
  res.json({ message: '라운드 종료', survivors: gameState.lastSurvivors });
});

// ✅ 참가자 상태 조회
app.get('/admin/participants', (req, res) => {
  const survivors = gameState.lastSurvivors.split(',').map(name => name.trim());
  const data = gameState.participants.map(p => ({
    ...p,
    survived: survivors.includes(p.name)
  }));

  res.json(data);
});

// ✅ 현재 문제 및 상태
app.get('/question', (req, res) => {
  res.json({
    question: gameState.currentQuestion,
    status: gameState.status,
    survivors: gameState.lastSurvivors
  });
});

// ✅ GPT 질문 - 정답 유추 및 문제 직접 언급 차단 강화
app.post('/ask-gpt', async (req, res) => {
  const { message } = req.body;

  const forbiddenKeywords = [
    '정답', '힌트', '맞아', '틀려', '○', 'X', 'O', 'o', 'x',
    '답이', '답은', 'answer', 'ox', '퀴즈', '참인가요', '거짓인가요'
  ];

  const lowerMessage = message.toLowerCase();
  const question = gameState.currentQuestion || '';
  const lowerQuestion = question.toLowerCase();

  const significantWords = question
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
    .split(' ')
    .filter(w => w.length >= 3);

  const triggers =
    forbiddenKeywords.some(w => lowerMessage.includes(w)) ||
    significantWords.some(word => lowerMessage.includes(word.toLowerCase()));

  if (triggers) {
    return res.json({ reply: '❌ 반칙은 안돼요! 문제에 대한 질문은 금지입니다.' });
  }

  const reply = await askQuestionToGPT(message);
  res.json({ reply });
});

// ✅ 서버 실행
app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
