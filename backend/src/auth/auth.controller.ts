import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('worker-login')
  async workerLogin(@Body() body: { phoneNumber: string; password: string }) {
    try {
      const result = await this.authService.workerLogin(body.phoneNumber, body.password);
      return { success: true, ...result };
    } catch (error) {
      throw new HttpException(
        { success: false, message: 'Invalid phone number or password' },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
