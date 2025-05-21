const express = require('express');
const app = express();
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { generateOXQuestion, askQuestionToGPT } = require('./openai');
const { getTeamOXQuestion } = require('./sheet_team_gpt');
const fs = require('fs');

require('dotenv').config();

if (process.env.GOOGLE_CREDENTIALS_JSON && !fs.existsSync('credentials.json')) {
  const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_JSON, 'base64').toString('utf-8');
  fs.writeFileSync('credentials.json', decoded);
  console.log('✅ credentials.json 복원 완료');
}

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
  quizType: 'general',
  round: 0,
  currentQuestion: '',
  currentAnswer: '',
  participants: [],
  status: 'waiting',
  lastSurvivors: [],
  roundParticipants: {},
  logs: []
};

function addLogEntry(message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `🕓 ${timestamp} - ${message}`;
  gameState.logs.push(entry);
  if (gameState.logs.length > 100) gameState.logs.shift();
}

const getQuestionForCurrentType = async () => {
  return gameState.quizType === 'team' ? await getTeamOXQuestion() : await generateOXQuestion();
};

app.post('/admin/set-type', (req, res) => {
  const { type } = req.body;
  if (type === 'team' || type === 'general') {
    gameState.quizType = type;
    addLogEntry(`퀴즈 타입 설정됨 → ${type}`);
    res.json({ message: '타입 설정 완료' });
  } else {
    res.status(400).json({ message: '유효하지 않은 타입' });
  }
});

app.post('/admin/start', async (req, res) => {
  gameState.round = 1;
  gameState.participants = [];
  const q = await getQuestionForCurrentType();
  gameState.currentQuestion = q.question;
  gameState.currentAnswer = q.answer;
  gameState.status = 'active';
  addLogEntry(`게임 시작됨 - ${q.question}`);

  io.emit('newQuestion', { question: q.question });
  res.json({ message: '게임 시작됨', question: q.question });
});

app.post('/admin/next', async (req, res) => {
  gameState.round += 1;
  gameState.participants = [];
  const q = await getQuestionForCurrentType();
  gameState.currentQuestion = q.question;
  gameState.currentAnswer = q.answer;
  gameState.status = 'active';
  addLogEntry(`다음 문제 출제됨 - ${q.question}`);

  io.emit('newQuestion', { question: q.question });
  res.json({ message: `문제 ${gameState.round} 출제됨`, question: q.question });
});

app.post('/submit', (req, res) => {
  const { name, answer } = req.body;
  if (gameState.status !== 'active') return res.status(403).json({ message: '현재 응답할 수 없습니다.' });

  const submittedName = name.trim().toLowerCase();
  if (gameState.participants.find(p => p.name.trim().toLowerCase() === submittedName)) {
    return res.status(409).json({ message: '이미 제출하셨습니다.' });
  }

  if (gameState.round > 1) {
    const survivors = gameState.lastSurvivors.map(n => n.trim().toLowerCase());
    if (!survivors.includes(submittedName)) {
      return res.status(403).json({ message: '생존자만 제출할 수 있습니다.' });
    }
  }

  if (!gameState.roundParticipants[gameState.round]) {
    gameState.roundParticipants[gameState.round] = [];
  }
  gameState.roundParticipants[gameState.round].push(name.trim());

  gameState.participants.push({ name: name.trim(), answer });

  const survivors = (gameState.lastSurvivors || []).map(n => n.trim().toLowerCase());
  const participantsWithStatus = gameState.participants.map(p => ({
    ...p,
    survived: survivors.includes(p.name.trim().toLowerCase())
  }));
  io.emit('newParticipant', participantsWithStatus);

  res.sendStatus(200);
});

app.post('/admin/end', (req, res) => {
  const survivors = gameState.participants.filter(p =>
    p.answer.trim().toUpperCase() === gameState.currentAnswer.trim().toUpperCase()
  );
  const names = survivors.map(s => s.name.trim()).filter(Boolean);

  gameState.lastSurvivors = names;
  gameState.status = 'ended';
  addLogEntry(`🔴 라운드 종료됨 - 생존자 ${names.join(', ')}`);

  io.emit('roundEnded', {
    answer: gameState.currentAnswer,
    survivors: gameState.lastSurvivors
  });

  res.json({ message: '라운드 종료', survivors: gameState.lastSurvivors });
});

app.get('/admin/participants', (req, res) => {
  const survivors = (gameState.lastSurvivors || []).map(name => name.trim().toLowerCase());
  const data = gameState.participants.map(p => ({
    ...p,
    survived: survivors.includes(p.name.trim().toLowerCase())
  }));
  res.json(data);
});

app.get('/admin/logs', (req, res) => {
  res.json(gameState.logs);
});

http.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
