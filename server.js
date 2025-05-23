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
  logs: [],
  allSurvivors: new Set(),
  // ✅ 개인정보 보호: 이름은 저장하지 않고 카운트만
  currentVotes: { 
    O: { count: 0 }, 
    X: { count: 0 } 
  },
  submittedUsers: new Set(),
  // ✅ 추첨 기능을 위한 상태
  isDrawing: false,
  drawWinners: []
};

function addLogEntry(message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `🕓 ${timestamp} - ${message}`;
  gameState.logs.push(entry);
  if (gameState.logs.length > 100) gameState.logs.shift();
}

const getQuestionForCurrentType = async () => {
  return gameState.quizType === 'team'
    ? await getTeamOXQuestion()
    : await generateOXQuestion();
};

// ✅ 실시간 투표 현황 업데이트 함수 강화
function updateVoteStatus() {
  const voteData = {
    votes: gameState.currentVotes,
    totalSubmitted: gameState.submittedUsers.size,
    totalParticipants: gameState.participants.length,
    // ✅ 퍼센티지 계산
    oPercentage: gameState.participants.length > 0 
      ? Math.round((gameState.currentVotes.O.count / gameState.participants.length) * 100) 
      : 0,
    xPercentage: gameState.participants.length > 0 
      ? Math.round((gameState.currentVotes.X.count / gameState.participants.length) * 100) 
      : 0
  };
  io.emit('voteUpdate', voteData);
}

// ✅ 투표 현황 초기화 함수 (개인정보 보호)
function resetVoteTracking() {
  gameState.currentVotes = { 
    O: { count: 0 }, 
    X: { count: 0 } 
  };
  gameState.submittedUsers.clear();
}

io.on('connection', (socket) => {
  console.log('새 클라이언트 연결됨');
  
  socket.emit('participantCount', gameState.participants.length);
  
  if (gameState.lastSurvivors && gameState.lastSurvivors.length > 0) {
    socket.emit('survivors', { survivors: gameState.lastSurvivors });
  }
  
  // ✅ 추첨 진행 중이면 알림
  if (gameState.isDrawing) {
    socket.emit('drawingInProgress');
  }
  
  socket.on('disconnect', () => {
    console.log('클라이언트 연결 해제됨');
  });
});

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
  resetVoteTracking(); // ✅ 투표 추적 초기화
  
  const q = await getQuestionForCurrentType();
  gameState.currentQuestion = q.question;
  gameState.currentAnswer = q.answer;
  gameState.status = 'active';
  addLogEntry(`게임 시작됨 - ${q.question}`);

  io.emit('newQuestion', { 
    question: q.question,
    round: gameState.round,
    status: gameState.status
  });
  res.json({ message: '게임 시작됨', question: q.question });
});

app.post('/admin/next', async (req, res) => {
  gameState.round += 1;
  gameState.participants = [];
  resetVoteTracking(); // ✅ 투표 추적 초기화
  
  const q = await getQuestionForCurrentType();
  gameState.currentQuestion = q.question;
  gameState.currentAnswer = q.answer;
  gameState.status = 'active';
  addLogEntry(`다음 문제 출제됨 - ${q.question}`);

  io.emit('newQuestion', { 
    question: q.question,
    round: gameState.round,
    status: gameState.status
  });
  io.emit('survivors', { survivors: gameState.lastSurvivors });
  res.json({ message: `문제 ${gameState.round} 출제됨`, question: q.question });
});

app.post('/admin/core-question', (req, res) => {
  const { version } = req.body;

  const hardcodedQuestions = {
    1: { question: 'SK AX는 SK C&C의 새 이름인가요?', answer: 'O' },
    2: { question: 'GPT는 사람보다 정확하다?', answer: 'X' }
  };

  const selected = hardcodedQuestions[version];
  if (!selected) {
    return res.status(400).json({ message: '존재하지 않는 핵심퀴즈입니다.' });
  }

  gameState.round += 1;
  gameState.participants = [];
  resetVoteTracking(); // ✅ 투표 추적 초기화
  
  gameState.currentQuestion = selected.question;
  gameState.currentAnswer = selected.answer;
  gameState.status = 'active';
  addLogEntry(`💡 핵심퀴즈 ${version} 출제됨 - ${selected.question}`);

  io.emit('newQuestion', { 
    question: selected.question,
    round: gameState.round,
    status: gameState.status
  });
  io.emit('survivors', { survivors: gameState.lastSurvivors });
  res.json({ message: `핵심퀴즈 ${version} 출제됨`, question: selected.question });
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
  
  // ✅ 실시간 투표 추적 업데이트 (이름 제외)
  gameState.submittedUsers.add(name.trim());
  const answerKey = answer.trim().toUpperCase();
  if (answerKey === 'O' || answerKey === 'X') {
    gameState.currentVotes[answerKey].count++;
    // 이름은 저장하지 않음 (개인정보 보호)
  }

  const survivors = (gameState.lastSurvivors || []).map(n => n.trim().toLowerCase());
  const participantsWithStatus = gameState.participants.map(p => ({
    ...p,
    survived: survivors.includes(p.name.trim().toLowerCase())
  }));
  
  io.emit('newParticipant', participantsWithStatus);
  io.emit('participantCount', gameState.participants.length);
  updateVoteStatus(); // ✅ 실시간 투표 현황 업데이트
  
  res.sendStatus(200);
});

app.post('/admin/end', (req, res) => {
  const survivors = gameState.participants.filter(p =>
    p.answer.trim().toUpperCase() === gameState.currentAnswer.trim().toUpperCase()
  );
  const names = survivors.map(s => s.name.trim()).filter(Boolean);

  gameState.lastSurvivors = names;
  gameState.status = 'ended';

  names.forEach(name => gameState.allSurvivors.add(name.trim().toLowerCase()));
  
  addLogEntry(`🔴 라운드 종료됨 - 생존자 ${names.join(', ')}`);

  io.emit('roundEnded', {
    answer: gameState.currentAnswer,
    survivors: gameState.lastSurvivors
  });

  res.json({ message: '라운드 종료', survivors: gameState.lastSurvivors });
});

// ✅ **NEW: 생존자 추첨 API**
app.post('/admin/draw-winners', (req, res) => {
  const { count = 1 } = req.body;
  
  if (!gameState.lastSurvivors || gameState.lastSurvivors.length === 0) {
    return res.status(400).json({ message: '추첨할 생존자가 없습니다.' });
  }
  
  if (count > gameState.lastSurvivors.length) {
    return res.status(400).json({ message: '생존자 수보다 많은 당첨자를 뽑을 수 없습니다.' });
  }
  
  // 추첨 진행 상태로 변경
  gameState.isDrawing = true;
  io.emit('drawingStarted', { 
    totalSurvivors: gameState.lastSurvivors.length,
    drawCount: count 
  });
  
  // 1초 후 추첨 결과 발표 (긴장감 조성)
  setTimeout(() => {
    const shuffled = [...gameState.lastSurvivors].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, count);
    
    gameState.drawWinners = winners;
    gameState.isDrawing = false;
    
    addLogEntry(`🎁 추첨 완료 - 당첨자: ${winners.join(', ')}`);
    
    // 모든 클라이언트에게 당첨자 발표
    io.emit('drawingResult', {
      winners: winners,
      totalSurvivors: gameState.lastSurvivors.length,
      drawCount: count
    });
    
    res.json({ 
      message: '추첨 완료', 
      winners: winners,
      totalSurvivors: gameState.lastSurvivors.length 
    });
  }, 1000);
});

// ✅ **NEW: 실시간 투표 현황 조회 API** (어드민용)
app.get('/admin/vote-status', (req, res) => {
  const voteData = {
    votes: gameState.currentVotes,
    totalSubmitted: gameState.submittedUsers.size,
    totalParticipants: gameState.participants.length,
    oPercentage: gameState.participants.length > 0 
      ? Math.round((gameState.currentVotes.O.count / gameState.participants.length) * 100) 
      : 0,
    xPercentage: gameState.participants.length > 0 
      ? Math.round((gameState.currentVotes.X.count / gameState.participants.length) * 100) 
      : 0,
    currentQuestion: gameState.currentQuestion,
    currentAnswer: gameState.currentAnswer,
    round: gameState.round,
    status: gameState.status
  };
  res.json(voteData);
});

app.get('/admin/participants', (req, res) => {
  const survivors = gameState.allSurvivors || new Set();
  const data = gameState.participants.map(p => ({
    ...p,
    survived: survivors.has(p.name.trim().toLowerCase())
  }));
  res.json(data);
});

app.get('/admin/logs', (req, res) => {
  res.json(gameState.logs);
});

app.get('/question', (req, res) => {
  res.json({
    question: gameState.currentQuestion || '문제 없음',
    status: gameState.status,
    participantCount: gameState.participants.length,
    currentRound: gameState.round,
    survivors: Array.isArray(gameState.lastSurvivors)
      ? gameState.lastSurvivors.join(', ')
      : '',
    // ✅ 클라이언트에서도 투표 현황 확인 가능
    voteStatus: {
      oCount: gameState.currentVotes.O.count,
      xCount: gameState.currentVotes.X.count,
      totalSubmitted: gameState.submittedUsers.size
    }
  });
});

app.post('/ask-gpt', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const reply = await askQuestionToGPT(message);
    res.json({ reply });
  } catch (error) {
    console.error('GPT API 오류:', error);
    res.status(500).json({ error: 'GPT 응답을 가져올 수 없습니다.' });
  }
});

app.post('/admin/reset', (req, res) => {
  gameState = {
    quizType: 'general',
    round: 0,
    currentQuestion: '',
    currentAnswer: '',
    participants: [],
    status: 'waiting',
    lastSurvivors: [],
    roundParticipants: {},
    logs: [],
    allSurvivors: new Set(),
    currentVotes: { 
      O: { count: 0 }, 
      X: { count: 0 } 
    },
    submittedUsers: new Set(),
    isDrawing: false,
    drawWinners: []
  };
  addLogEntry('🔄 전체 게임 초기화됨 (1라운드부터)');
  io.emit('reset');
  res.json({ message: '게임이 초기화되었습니다.' });
});

http.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
