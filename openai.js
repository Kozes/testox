# openai.js의 파싱 로직을 강화한 버전 저장

openai_js = """
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateOXQuestion = async () => {
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `넌 OX 퀴즈 출제자야. 반드시 아래 형식으로 출력해.

문제: (OX 퀴즈 문장 한 줄)
정답: O 또는 X`
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
    const lines = text.split('\\n').filter(Boolean);
    question = lines.find(line => !line.includes('정답')) || '질문 없음';
  }

  const answer = answerMatch ? answerMatch[1].toUpperCase() : 'X';

  return {
    question,
    answer
  };
};

const askQuestionToGPT = async (prompt) => {
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: '너는 OX 퀴즈 AI야. 정답을 유추하거나 판단하지 말고, 중립적인 일반 질문에만 답해.'
      },
      { role: 'user', content: prompt }
    ]
  });

  return res.choices[0].message.content;
};

module.exports = {
  generateOXQuestion,
  askQuestionToGPT
};
"""

with open("/mnt/data/openai.js", "w", encoding="utf-8") as f:
    f.write(openai_js.strip())

# 사용자 index.html에서 정답을 alert가 아니라 페이지에 표시하도록 수정
index_html_updated = """
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>SK AX OX 퀴즈</title>
  <link rel="stylesheet" href="style.css" />
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <div class="overlay">
    <img src="skax-logo.png" alt="SK AX 로고" class="logo" />
    <p class="tagline">Future with AI, Powered by SK AX</p>
    <p class="subtagline">HC2 Group TownHall Meeting</p>

    <div id="question-box" class="question-box">문제 없음</div>
    <input type="text" id="username" placeholder="이름을 입력하세요" />
    <div>
      <button onclick="submitAnswer('O')">⭕ O</button>
      <button onclick="submitAnswer('X')">❌ X</button>
    </div>

    <div id="chat-box" class="chat-box"></div>
    <div class="chat-input-area">
      <input type="text" id="chat-input" placeholder="GPT에게 질문하세요..." />
      <button onclick="sendMessage()">전송</button>
    </div>

    <div class="survivor-box" id="survivor-box" style="display: none;">
      <h4>🔥 생존자 리스트 (<span id="survivor-count">0</span>명)</h4>
      <ul id="survivor-list" class="survivor-grid"></ul>
    </div>

    <div id="answer-display" style="margin-top: 20px; font-size: 1.2em; font-weight: bold; color: green;"></div>
  </div>

  <script>
    const socket = io();

    socket.on('roundEnded', (data) => {
      document.getElementById('answer-display').innerText = `✅ 정답: ${data.answer}`;
      const box = document.getElementById('survivor-box');
      const list = document.getElementById('survivor-list');
      const count = document.getElementById('survivor-count');

      box.style.display = 'block';
      list.innerHTML = '';

      if (data.survivors && data.survivors.length > 0) {
        count.innerText = data.survivors.length;
        data.survivors.slice(0, 10).forEach(name => {
          const li = document.createElement('li');
          li.textContent = name;
          list.appendChild(li);
        });
        if (data.survivors.length > 10) {
          const li = document.createElement('li');
          li.style.color = 'gray';
          li.textContent = `외 ${data.survivors.length - 10}명 더 있음`;
          list.appendChild(li);
        }
      } else {
        count.innerText = 0;
        list.innerHTML = '<li style="color:gray;">😢 생존자가 없습니다</li>';
      }
    });

    async function loadQuestion() {
      const res = await fetch('/question');
      const data = await res.json();
      document.getElementById('question-box').innerText = data.question || '문제 없음';
    }

    async function submitAnswer(answer) {
      const name = document.getElementById('username').value.trim();
      if (!name) return alert('이름을 입력하세요!');
      const res = await fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, answer })
      });

      if (res.status === 409) alert('이미 제출하셨습니다!');
      else if (res.status === 403) alert('생존자만 제출할 수 있습니다.');
      else alert('제출 완료!');
    }

    async function sendMessage() {
      const input = document.getElementById('chat-input');
      const message = input.value.trim();
      if (!message) return;
      input.value = '';
      const chat = document.getElementById('chat-box');
      chat.innerHTML += `<div>🙋 ${message}</div>`;
      const res = await fetch('/ask-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      chat.innerHTML += `<div>🤖 ${data.reply}</div>`;
    }

    window.onload = loadQuestion;
  </script>
</body>
</html>
"""

with open("/mnt/data/index.html", "w", encoding="utf-8") as f:
    f.write(index_html_updated.strip())
