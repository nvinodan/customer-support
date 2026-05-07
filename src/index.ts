import readline from 'readline';
import { agent } from './agent.ts';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = () => {
  rl.question('\nYou: ', async (input) => {
    const message = input.trim();
    if (!message) {
      ask();
      return;
    }
    if (message.toLowerCase() === 'exit') {
      rl.close();
      return;
    }
    try {
      await agent.invoke(message);
    } catch (err) {
      console.error('Error:', err);
    }
    ask();
  });
};

console.log('Customer Support Agent (type "exit" to quit)');
ask();
