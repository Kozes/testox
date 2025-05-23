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
  drawWinners: [],
  // ✅ NEW: 라운드별 생존/탈락 추적
  roundHistory: {}, // { participantName: { rounds: [1,2,3], eliminatedAt: 4 } }
  participantDetails: {}, // { participantName: { totalRounds: 3, status: 'survived/eliminated', lastRound: 3 } }
  currentExplanation: null, // ✅ 팀 퀴즈 해설 임시 저장
  gameReady: true, // ✅ 게임 준비 상태
};

function addLogEntry(message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `🕓 ${timestamp} - ${message}`;
  gameState.logs.push(entry);
  if (gameState.logs.length > 100) gameState.logs.shift();
}

// ✅ NEW: 해설 생성 함수 추가
async function generateExplanation(question, answer) {
  try {
    // 팀 퀴즈인 경우 이미 해설이 포함되어 있으므로 바로 반환
    if (gameState.currentExplanation) {
      const explanation = gameState.currentExplanation;
      gameState.currentExplanation = null; // 사용 후 초기화
      return explanation;
    }
    
    const prompt = `
다음 OX 퀴즈의 해설을 작성해주세요:

문제: ${question}
정답: ${answer}

요구사항:
- 왜 ${answer}가 정답인지 명확하게 설명
- 2-3문장으로 간결하게 작성
- 관련된 흥미로운 사실이나 배경 지식 포함
- 친근하고 이해하기 쉬운 톤으로 작성
- 단순히 "정답은 ${answer}입니다"와 같은 형식은 피할 것`;

    const result = await askQuestionToGPT(prompt);
    return result.trim();
  } catch (error) {
    console.error('해설 생성 실패:', error);
    return `정답은 ${answer}입니다. ${answer === 'O' ? '이 내용은 사실입니다.' : '이 내용은 사실이 아닙니다.'}`;
  }
}

const getQuestionForCurrentType = async () => {
  const result = gameState.quizType === 'team'
    ? await getTeamOXQuestion()
    : await generateOXQuestion();
  
  // 팀 퀴즈의 경우 해설을 임시 저장
  if (gameState.quizType === 'team' && result.explanation) {
    gameState.currentExplanation = result.explanation;
  }
  
  return result;
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
  gameState.gameReady = true; // ✅ 게임 준비 상태 설정
  
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
  // ✅ 게임 준비 상태를 true로 설정
  gameState.gameReady = true;
  
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
  gameState.gameReady = true; // ✅ 게임 준비 상태 설정
  
  gameState.currentQuestion = selected.question;
  gameState.currentAnswer = selected.answer;
  gameState.status = 'active';
  gameState.currentExplanation = null; // ✅ 핵심 퀴즈는 해설 없음
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

app.post('/admin/end', async (req, res) => {
  // ✅ 게임 준비 상태를 false로 설정
  gameState.gameReady = false;
  
  const survivors = gameState.participants.filter(p =>
    p.answer.trim().toUpperCase() === gameState.currentAnswer.trim().toUpperCase()
  );
  const eliminated = gameState.participants.filter(p =>
    p.answer.trim().toUpperCase() !== gameState.currentAnswer.trim().toUpperCase()
  );
  
  const names = survivors.map(s => s.name.trim()).filter(Boolean);
  const totalParticipants = gameState.participants.length;
  const correctCount = survivors.length;
  const incorrectCount = eliminated.length;
  const correctRate = totalParticipants > 0 ? Math.round((correctCount / totalParticipants) * 100) : 0;

  gameState.lastSurvivors = names;
  gameState.status = 'ended';

  // ✅ 생존자 누적 저장
  names.forEach(name => gameState.allSurvivors.add(name.trim().toLowerCase()));
  
  // ✅ 라운드별 이력 업데이트
  gameState.participants.forEach(p => {
    const name = p.name.trim();
    const nameLower = name.toLowerCase();
    
    if (!gameState.roundHistory[nameLower]) {
      gameState.roundHistory[nameLower] = { rounds: [], eliminatedAt: null };
    }
    
    if (!gameState.roundHistory[nameLower].rounds.includes(gameState.round)) {
      gameState.roundHistory[nameLower].rounds.push(gameState.round);
    }
    
    if (eliminated.some(e => e.name.trim() === name) && !gameState.roundHistory[nameLower].eliminatedAt) {
      gameState.roundHistory[nameLower].eliminatedAt = gameState.round;
    }
    
    gameState.participantDetails[nameLower] = {
      name: name,
      totalRounds: gameState.roundHistory[nameLower].rounds.length,
      status: names.includes(name) ? 'survived' : 'eliminated',
      lastRound: gameState.round,
      eliminatedAt: gameState.roundHistory[nameLower].eliminatedAt,
      survivedRounds: gameState.roundHistory[nameLower].rounds.filter(r => 
        !gameState.roundHistory[nameLower].eliminatedAt || r < gameState.roundHistory[nameLower].eliminatedAt
      )
    };
  });
  
  // ✅ NEW: 해설 자동 생성
  let explanation = '';
  try {
    console.log('🔍 해설 생성 시작...');
    explanation = await generateExplanation(gameState.currentQuestion, gameState.currentAnswer);
    console.log('✅ 해설 생성 완료:', explanation.substring(0, 50) + '...');
  } catch (error) {
    console.error('❌ 해설 생성 실패:', error);
    explanation = '해설을 생성할 수 없습니다.';
  }
  
  addLogEntry(`🔴 라운드 종료됨 - 생존자 ${correctCount}명 (정답률 ${correctRate}%)`);

  // ✅ 확장된 라운드 결과 전송
  const roundResult = {
    question: gameState.currentQuestion,
    answer: gameState.currentAnswer,
    round: gameState.round,
    survivors: gameState.lastSurvivors,
    stats: {
      totalParticipants,
      correctCount,
      incorrectCount,
      correctRate
    },
    explanation
  };
  
  console.log('📡 roundEnded 이벤트 전송:', {
    question: roundResult.question.substring(0, 30) + '...',
    answer: roundResult.answer,
    round: roundResult.round,
    survivorCount: roundResult.survivors.length,
    stats: roundResult.stats
  });
  
  io.emit('roundEnded', roundResult);

  // ✅ 별도로 생존자 정보도 전송 (기존 호환성)
  io.emit('survivors', { survivors: gameState.lastSurvivors });

  res.json({ 
    message: '라운드 종료', 
    survivors: gameState.lastSurvivors,
    stats: { totalParticipants, correctCount, incorrectCount, correctRate }
  });
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

// ✅ NEW: 라운드별 참가자 상세 정보 API
app.get('/admin/participants-detailed', (req, res) => {
  const { filter } = req.query; // 'all', 'survived', 'eliminated', 'round-X'
  
  let participants = Object.values(gameState.participantDetails);
  
  // 필터 적용
  if (filter === 'survived') {
    participants = participants.filter(p => p.status === 'survived');
  } else if (filter === 'eliminated') {
    participants = participants.filter(p => p.status === 'eliminated');
  } else if (filter?.startsWith('round-')) {
    const targetRound = parseInt(filter.split('-')[1]);
    participants = participants.filter(p => 
      p.survivedRounds.includes(targetRound) || 
      (p.eliminatedAt === targetRound)
    );
  }
  
  // 최신 라운드 순으로 정렬
  participants.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'survived' ? -1 : 1; // 생존자 먼저
    }
    return b.lastRound - a.lastRound;
  });
  
  res.json({
    participants,
    totalParticipants: Object.keys(gameState.participantDetails).length,
    currentSurvivors: participants.filter(p => p.status === 'survived').length,
    currentRound: gameState.round,
    availableRounds: Array.from(new Set(Object.values(gameState.participantDetails).flatMap(p => p.survivedRounds))).sort((a,b) => a-b)
  });
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
  // ✅ 게임 준비 상태에 따라 다른 메시지 표시
  const questionText = gameState.currentQuestion || 
    (gameState.gameReady ? '문제 없음' : '🎯 라운드 준비중...');
  
  res.json({
    question: questionText,
    status: gameState.status,
    participantCount: gameState.participants.length,
    currentRound: gameState.round,
    survivors: Array.isArray(gameState.lastSurvivors)
      ? gameState.lastSurvivors.join(', ')
      : '',
    voteStatus: {
      oCount: gameState.currentVotes.O.count,
      xCount: gameState.currentVotes.X.count,
      totalSubmitted: gameState.submittedUsers.size
    },
    gameReady: gameState.gameReady // ✅ 준비 상태 전송
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
    drawWinners: [],
    roundHistory: {},
    participantDetails: {},
    currentExplanation: null,
    gameReady: true
  };
  addLogEntry('🔄 전체 게임 초기화됨 (1라운드부터)');
  io.emit('reset');
  res.json({ message: '게임이 초기화되었습니다.' });
});

http.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
