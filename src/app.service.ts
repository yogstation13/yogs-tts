import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { Md5 } from 'ts-md5';
import { join } from 'path';
import type { ttsMessage } from './tts_message';
import * as fsExtra from 'fs-extra';

const execPromise = promisify(exec);

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getPing(): string {
    return 'Hello, world!';
  }

  clearTTSCache(auth?: string): void {
    if (auth != (process.env.TTS_AUTHORIZATION_TOKEN ?? 'mysecuretoken')) {
      return;
    }
    fsExtra.emptyDirSync('./piper_cache');
  }

  async getTTS(
    model: string,
    pitch: string,
    body: ttsMessage,
    res?: Response,
    auth?: string,
  ): Promise<StreamableFile | string> {
    if (auth != (process.env.TTS_AUTHORIZATION_TOKEN ?? 'mysecuretoken')) {
      return 'bad auth';
    }

    if (model == null || body.message == null) {
      return 'missing args';
    }

    pitch = pitch || '1';

    // Sanitize
    const cmd_regex = /^a-zA-Z0-9,._+:@%\/\- /g;
    const sanitized_message: string = body.message; // Does not need sanitization- It is going into a JSON file
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
      return 'model not found';
    }

    // The name of the out file is an MD5 of the model and the message
    let filterKeys = '';
    if (body.filters) {
      const keys: string[] = Object.keys(body.filters);
      filterKeys = keys.join('-');
    }
    const outFile = Md5.hashAsciiStr(
      `${sanitized_model}${sanitized_message}${num_pitch}${filterKeys}`,
    );
    // If the out file is in our cache, just grab it
    if (fs.existsSync(`./piper_cache/${outFile}-a.wav`)) {
      const file = fs.createReadStream(
        join(process.cwd(), `./piper_cache/${outFile}-a.wav`),
      );
      return new StreamableFile(file);
    }
    if (fs.existsSync(`./piper_cache/${outFile}-b.wav`)) {
      const file = fs.createReadStream(
        join(process.cwd(), `./piper_cache/${outFile}-b.wav`),
      );
      return new StreamableFile(file);
    }

    fs.writeFileSync(
      `./piper_cache/${outFile}.json`,
      JSON.stringify({ text: sanitized_message }),
      'utf8',
    );

    // Generate TTS out file
    const { stdout, stderr } = await execPromise(
      `cat ./piper_cache/${outFile}.json | \
      ./piper/piper \
      --model ${modelPath} \
      --output_file ./piper_cache/${outFile}.wav \
      --json-input`,
    );

    // Send out file if it exists
    if (fs.existsSync(`./piper_cache/${outFile}.wav`)) {
      // Use ffmpeg to apply pitch and filters
      await execPromise(
        `ffmpeg -y -i ./piper_cache/${outFile}.wav -af asetrate=${modelRate}*${num_pitch},aresample=${modelRate},atempo=1/${num_pitch} ./piper_cache/${outFile}-b.wav`,
      );
      let flip_flop = false; // Tosses between file-a and file-b
      if (body.filters?.lizard) {
        await execPromise(
          `ffmpeg -y -f wav -i ./piper_cache/${outFile}-${
            flip_flop ? 'a' : 'b'
          }.wav -filter_complex '[0:a] asplit [out0][out2]; [out0] asetrate=${modelRate}*0.9,aresample=${modelRate},atempo=1/0.9,aformat=channel_layouts=mono,volume=0.2 [p0]; [out2] asetrate=${modelRate}*1.1,aresample=${modelRate},atempo=1/1.1,aformat=channel_layouts=mono,volume=0.2[p2]; [p0][0][p2] amix=inputs=3' -f wav ./piper_cache/${outFile}-${
            flip_flop ? 'b' : 'a'
          }.wav`,
        );
        flip_flop = !flip_flop;
      }
      if (body.filters?.alien) {
        await execPromise(
          `ffmpeg -y -f wav -i ./piper_cache/${outFile}-${
            flip_flop ? 'a' : 'b'
          }.wav -filter_complex '[0:a] asplit [out0][out2]; [out0] asetrate=${modelRate}*0.8,aresample=${modelRate},atempo=1/0.8,aformat=channel_layouts=mono [p0]; [out2] asetrate=${modelRate}*1.2,aresample=${modelRate},atempo=1/1.2,aformat=channel_layouts=mono[p2]; [p0][0][p2] amix=inputs=3' -f wav ./piper_cache/${outFile}-${
            flip_flop ? 'b' : 'a'
          }.wav`,
        );
        flip_flop = !flip_flop;
      }
      if (body.filters?.ethereal) {
        await execPromise(
          `ffmpeg -y -f wav -i ./piper_cache/${outFile}-${
            flip_flop ? 'a' : 'b'
          }.wav -filter_complex '[0:a] asplit [out0][out2]; [out0] asetrate=${modelRate}*0.99,aresample=${modelRate},volume=0.3 [p0]; [p0][out2] amix=inputs=2' -f wav ./piper_cache/${outFile}-${
            flip_flop ? 'b' : 'a'
          }.wav`,
        );
        flip_flop = !flip_flop;
      }
      if (body.filters?.robotic) {
        await execPromise(
          `ffmpeg -y -f wav -i ./piper_cache/${outFile}-${
            flip_flop ? 'a' : 'b'
          }.wav -i ./sfx/SynthImpulse.wav -i ./sfx/RoomImpulse.wav -filter_complex '[0] aresample=${modelRate} [re_1]; [re_1] apad=pad_dur=2 [in_1]; [in_1] asplit=2 [in_1_1] [in_1_2]; [in_1_1] [1] afir=dry=10:wet=10 [reverb_1]; [in_1_2] [reverb_1] amix=inputs=2:weights=8 1 [mix_1]; [mix_1] asplit=2 [mix_1_1] [mix_1_2]; [mix_1_1] [2] afir=dry=1:wet=1 [reverb_2]; [mix_1_2] [reverb_2] amix=inputs=2:weights=10 1 [mix_2]; [mix_2] equalizer=f=7710:t=q:w=0.6:g=-6,equalizer=f=33:t=q:w=0.44:g=-10 [out]; [out] alimiter=level_in=1:level_out=1:limit=0.5:attack=5:release=20:level=disabled' -f wav ./piper_cache/${outFile}-${
            flip_flop ? 'b' : 'a'
          }.wav`,
        );
        flip_flop = !flip_flop;
      }
      if (body.filters?.masked) {
        await execPromise(
          `ffmpeg -y -f wav -i ./piper_cache/${outFile}-${
            flip_flop ? 'a' : 'b'
          }.wav -filter_complex 'lowpass=f=750,volume=2' -f wav ./piper_cache/${outFile}-${
            flip_flop ? 'b' : 'a'
          }.wav`,
        );
        flip_flop = !flip_flop;
      }
      if (body.filters?.robocop) {
        await execPromise(
          `ffmpeg -y -f wav -i ./piper_cache/${outFile}-${
            flip_flop ? 'a' : 'b'
          }.wav -i ./sfx/SynthImpulse.wav -i ./sfx/RoomImpulse.wav -filter_complex '[0:a] asetrate=${modelRate}*0.7,aresample=16000,atempo=1/0.7,lowshelf=g=-20:f=500,highpass=f=500,aphaser=in_gain=1:out_gain=1:delay=3.0:decay=0.4:speed=0.5:type=t [out]; [out]atempo=1.2,volume=15dB [final]; anoisesrc=a=0.01:d=60 [noise]; [final][noise] amix=duration=shortest' -f wav ./piper_cache/${outFile}-${
            flip_flop ? 'b' : 'a'
          }.wav`,
        );
        flip_flop = !flip_flop;
      }
      if (body.filters?.radio) {
        await execPromise(
          `ffmpeg -y -f wav -i ./piper_cache/${outFile}-${
            flip_flop ? 'a' : 'b'
          }.wav -filter_complex 'highpass=f=400,volume=2' -f wav ./piper_cache/${outFile}-${
            flip_flop ? 'b' : 'a'
          }.wav`,
        );
        flip_flop = !flip_flop;
      }
      const file = fs.createReadStream(
        join(
          process.cwd(),
          `./piper_cache/${outFile}-${flip_flop ? 'a' : 'b'}.wav`,
        ),
      );
      return new StreamableFile(file);
    } else {
      // If file generation failed, send a warning- this isn't supposed to happen
      this.logger.warn(`${stderr} - ${stdout}`);
      return `${stderr} - ${stdout}`;
    }
  }
}
