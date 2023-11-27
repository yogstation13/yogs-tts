import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import type ttsMessage from './tts_message';

describe('AppController', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
  });

  describe('getModelNotFound', () => {
    it('should return "model not found"', () => {
      const appController = app.get(AppController);
      const body: ttsMessage = { message: 'Hello, world!' };
      expect(appController.getTTS('nonexistent_model_name', '0', body)).toBe(
        'model not found',
      );
    });
  });
});
