# yog-tts

Written in [nestjs](https://github.com/nestjs/nest)

Uses [piper](https://github.com/rhasspy/piper), which can be found in `./piper-src`

Piper voice models are individually licensed, please see `MODEL_CARD` under each voice folder (located in `./piper-voices`) to view attributions and licensing.

To compile & start the server, run `docker compose up --build`

Exposes on port 8133

## API usage:

`/tts?model={desired_model}&pitch={multiplier}`

Message should be in JSON body `{message: "Hello, world!"}`

Models can be found in `./piper-voices` and should be queried as `country-name` i.e. `GB-alba`

Example usage: `/tts?model=US-joe&pitch=1`
