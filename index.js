const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Fungsi untuk membuat delay 1 detik atau lebih
function sleep(ms) {
   return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fungsi untuk menangani input dari pengguna
const rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout,
});

// Fungsi untuk membaca akun dari file
function readAccountsFromFile(filePath) {
   const data = fs.readFileSync(filePath, 'utf8');
   const accounts = data
      .split('\n')
      .filter(Boolean)
      .map((line) => {
         const [initData, hash] = line.split('|');
         return { initData, hash };
      });
   return accounts;
}

// Fungsi untuk login dan mendapatkan accessToken
async function login(completeTasks, account) {
   try {
      const payload = {
         initData: account.initData,
         hash: account.hash,
      };

      const response = await axios.post('https://jupperapi.jup.bot/auth/telegram/login', payload, {
         headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
         },
      });

      if (response.status === 200) {
         const accessToken = response.data.accessToken;
         console.log('Login sukses! AccessToken:', accessToken);

         // Ambil userId dari initData
         const userId = extractUserIdFromInitData(account.initData);
         console.log('UserId:', userId);

         if (userId) {
            if (completeTasks) {
               // Panggil fungsi untuk mendapatkan tasks dan menyelesaikannya jika 'y'
               const tasksResponse = await getTasks(userId, accessToken);
               const tasks = tasksResponse.tasks; // Mengambil array tasks dari objek tasksResponse

               if (tasks) {
                  // Loop melalui setiap task, dengan delay 1 detik di antara eksekusi task
                  for (const task of tasks) {
                     if (!task.done) {
                        // Hanya kerjakan task yang belum selesai
                        await completeTask(userId, accessToken, task.taskId, task.description);
                        await sleep(1000); // Delay 1 detik
                     } else {
                        console.log(`Task "${task.description}" sudah selesai, dilewati.`);
                        await sleep(1000);
                     }
                  }
               }
            }

            // Setelah semua tasks selesai atau dilewati, mulai sesi farming game
            await startFarmingGame(userId, accessToken);
         } else {
            console.log('Gagal mendapatkan UserId');
         }
      } else {
         console.log('Login gagal:', response.status);
      }
   } catch (error) {
      console.error('Error saat login:', error);
   }
}

// Fungsi untuk mengekstrak userId dari initData
function extractUserIdFromInitData(initData) {
   const match = /"id":(\d+)/.exec(decodeURIComponent(initData)); // Decode URI lalu cari pola id
   return match ? match[1] : null; // Kembalikan userId jika ditemukan
}

// Fungsi untuk mendapatkan tasks berdasarkan userId dan accessToken
async function getTasks(userId, accessToken) {
   try {
      const tasksResponse = await axios.get(`https://jupperapi.jup.bot/users/${userId}/tasks`, {
         headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
         },
      });

      if (tasksResponse.status === 200) {
         console.log('Tasks ditemukan:');
         return tasksResponse.data; // Kembalikan daftar tasks
      } else {
         console.log('Gagal mendapatkan tasks:', tasksResponse.status);
         return null;
      }
   } catch (error) {
      console.error('Error saat mendapatkan tasks:', error);
      return null;
   }
}

// Fungsi untuk menyelesaikan task
async function completeTask(userId, accessToken, taskId, description) {
   try {
      const response = await axios.post(
         `https://jupperapi.jup.bot/users/${userId}/tasks/complete`,
         {
            taskId: taskId,
         },
         {
            headers: {
               Authorization: `Bearer ${accessToken}`,
               'Content-Type': 'application/json',
               Accept: 'application/json',
            },
         }
      );

      if (response.status === 200) {
         console.log(`Task "${description}" berhasil diselesaikan!`);
      } else {
         console.log(`Gagal menyelesaikan task "${description}": ${response.status}`);
      }
   } catch (error) {
      if (error.response && error.response.status === 400) {
         console.log(`Task "${description}" gagal diselesaikan karena error 400. Task dilewati.`);
      } else {
         console.error(`Error saat menyelesaikan task "${description}":`, error);
      }
   }
}

// Fungsi untuk memulai farming game
async function startFarmingGame(userId, accessToken) {
   try {
      const response = await axios.post(
         'https://jupperapi.jup.bot/games/start',
         {
            telegramId: userId,
         },
         {
            headers: {
               Authorization: `Bearer ${accessToken}`,
               'Content-Type': 'application/json',
               Accept: 'application/json',
            },
         }
      );

      if (response.status === 200) {
         const gameData = response.data;
         console.log(`Farming game dimulai! Type: ${gameData.type}, Points: ${gameData.points}, Status: ${gameData.clickerStatus}`);
      } else {
         console.log('Gagal memulai farming game:', response.status);
      }
   } catch (error) {
      if (error.response && error.response.status === 400) {
         // Ambil pesan error dari response jika farming sedang berjalan
         const errorMessage = 'Farming sedang berjalan';
         console.log(`Farming gagal karena: ${errorMessage}`);
      } else {
         console.error('Error saat memulai farming game:', error);
      }
   }
}

// Jalankan proses login dan task-looping secara berulang untuk multi akun
(async function run() {
   rl.question('Apakah Anda ingin menyelesaikan tasks terlebih dahulu? (y/n) Default: n: ', async (answer) => {
      let completeTasks = answer.trim().toLowerCase() === 'y' ? true : false;

      const accounts = readAccountsFromFile(path.join(__dirname, 'accounts.txt'));

      while (true) {
         for (const account of accounts) {
            console.log(`\nMulai proses untuk akun dengan initData: ${account.initData}`);
            await login(completeTasks, account);
         }

         // Setelah semua akun selesai, tunggu 10 menit sebelum memulai siklus berikutnya
         console.log('Semua akun telah selesai, menunggu 10 menit...');
         await sleep(600000); // Delay 10 menit

         // Setelah eksekusi pertama, set `completeTasks` ke false agar tidak lagi menyelesaikan tasks
         completeTasks = false;
      }
   });
})();
