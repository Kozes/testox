require("dotenv").config();
const { google } = require("googleapis");

async function fetchTeamMembers() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Team!A2:D" // A: 성명, B: 부서, C: 직책, D: 사번
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  return rows.map(([성명, 부서, 직책, 사번]) => ({
    성명,
    부서,
    직책,
    사번
  }));
}

module.exports = { fetchTeamMembers };