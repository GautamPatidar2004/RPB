import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5000';

class SocketService {
  private socket: Socket | null = null;

  public connect() {
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        transports: ['websocket'],
      });
      
      this.socket.on('connect', () => {
        console.log('Connected to Rail WebSockets');
      });
      
      this.socket.on('disconnect', () => {
        console.log('Disconnected from Rail WebSockets');
      });
    }
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
