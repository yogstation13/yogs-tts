import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  Headers,
  Body,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';
import type ttsMessage from './tts_message';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/ping')
  getPing(): string {
    return this.appService.getPing();
  }

  @Get('/tts')
  async getTTS(
    @Query('model') model: string,
    @Query('pitch') pitch: string,
    @Body() body: ttsMessage,
    @Res({ passthrough: true }) response?: Response,
    @Headers('Authorization') auth?: string,
  ): Promise<StreamableFile | string> {
    return await this.appService.getTTS(model, pitch, body, response, auth);
  }
}
