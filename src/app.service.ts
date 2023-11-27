import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { Md5 } from 'ts-md5';
import { join } from 'path';
import type ttsMessage from './tts_message';

const execPromise = promisify(exec);

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getPing(): string {
    return 'Hello, world!';
  }

  async getTTS(
    model: string,
    pitch: string,
    body: ttsMessage,
    res?: Response,
  ): Promise<StreamableFile | string> {
    if (model == null || body.message == null) {
      res?.set({
        'Content-Type': 'text/plain',
      });
      res.sendStatus(400);
      return 'missing args';
    }

    pitch = pitch || '1';

    // Sanitize
    const and_regex = /&/g;
    const cmd_regex = /^a-zA-Z0-9,._+:@%\/\- /g;
    const sanitized_message: string = body.message
      .replace(and_regex, 'and')
      .replace(cmd_regex, '');
    const sanitized_model: string = model.replace(cmd_regex, '');
    const sanitized_pitch: number = parseFloat(pitch.replace(cmd_regex, ''));
    const num_pitch: number = Math.min(
      Math.max(isNaN(sanitized_pitch) ? 1 : sanitized_pitch, 0.5),
      2,
    );

    // Find the model from the model name
    let modelPath: string;
    let modelRate: number;
    if (fs.existsSync(`./piper-voices/${sanitized_model}/low/`)) {
      modelPath = `./piper-voices/${sanitized_model}/low/en_${sanitized_model}-low.onnx`;
      modelRate = 16000;
    } else if (fs.existsSync(`./piper-voices/${sanitized_model}/medium/`)) {
      modelPath = `./piper-voices/${sanitized_model}/medium/en_${sanitized_model}-medium.onnx`;
      modelRate = 22050;
    } else if (fs.existsSync(`./piper-voices/${sanitized_model}/high/`)) {
      modelPath = `./piper-voices/${sanitized_model}/high/en_${sanitized_model}-high.onnx`;
      modelRate = 22050;
    }

    if (modelPath == null || !fs.existsSync(modelPath)) {
      res?.set({
        'Content-Type': 'text/plain',
      });
      res.sendStatus(404);
      return 'model not found';
    }

    // The name of the out file is an MD5 of the model and the message
    const outFile = Md5.hashAsciiStr(
      `${sanitized_model}${sanitized_message}${num_pitch}`,
    );
    // If the out file is in our cache, just grab it
    if (fs.existsSync(`./piper_cache/${outFile}-f.wav`)) {
      const file = fs.createReadStream(
        join(process.cwd(), `./piper_cache/${outFile}-f.wav`),
      );
      res?.set({
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="${outFile}.wav"`,
      });
      return new StreamableFile(file);
    }

    // Generate TTS out file
    const { stdout, stderr } = await execPromise(
      `echo '${sanitized_message}' | \
      ./piper/piper \
      --model ${modelPath} \
      --output_file ./piper_cache/${outFile}.wav`,
    );

    // Send out file if it exists
    if (fs.existsSync(`./piper_cache/${outFile}.wav`)) {
      // Use ffmpeg to modify output
      await execPromise(
        `ffmpeg -i ./piper_cache/${outFile}.wav -af asetrate=${modelRate}*${num_pitch},aresample=${modelRate},atempo=1/${num_pitch} ./piper_cache/${outFile}-f.wav`,
      );
      setTimeout(() => fs.unlinkSync(`./piper_cache/${outFile}.wav`), 10000); // Cached for 10 seconds
      setTimeout(() => fs.unlinkSync(`./piper_cache/${outFile}-f.wav`), 10000); // Cached for 10 seconds
      const file = fs.createReadStream(
        join(process.cwd(), `./piper_cache/${outFile}-f.wav`),
      );
      res?.set({
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="${outFile}-f.wav"`,
      });
      return new StreamableFile(file);
    } else {
      // If file generation failed, send a warning- this isn't supposed to happen
      this.logger.warn(`${stderr} - ${stdout}`);
      return `${stderr} - ${stdout}`;
    }
  }
}
