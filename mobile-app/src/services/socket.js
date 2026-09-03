import { io } from 'socket.io-client';

const SOCKET_URL = 'https://cityridestaxi.up.railway.app'; 

const socket = io(SOCKET_URL, {
  autoConnect: false, // We'll connect when needed (e.g., after login)
});

export default socket;
