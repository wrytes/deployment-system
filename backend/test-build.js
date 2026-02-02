const Docker = require('dockerode');
const Tar = require('tar-stream');

const docker = new Docker();

const dockerfileContent = `
FROM node:18-alpine

WORKDIR /app

RUN echo "Hello from test build"

CMD ["echo", "test"]
`;

const pack = Tar.pack();
pack.entry({ name: 'Dockerfile' }, dockerfileContent);
pack.finalize();

console.log('Starting build...');

docker.buildImage(
  pack,
  {
    t: 'test-build:latest',
  },
  (err, stream) => {
    if (err) {
      console.error('Build error:', err);
      process.exit(1);
    }

    if (!stream) {
      console.error('No stream');
      process.exit(1);
    }

    stream.pipe(process.stdout);

    stream.on('end', () => {
      console.log('\nBuild completed!');
      console.log('Checking if image exists...');

      docker.listImages({ filters: { reference: ['test-build:latest'] } }, (err, images) => {
        if (err) {
          console.error('Error listing images:', err);
          process.exit(1);
        }
        console.log('Image found:', images.length > 0);
        if (images.length > 0) {
          console.log('Image:', images[0]);
        }
        process.exit(0);
      });
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      process.exit(1);
    });
  }
);
