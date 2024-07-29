export default function watchInstance(blobUrl, requestId, timeout) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const stderr = await fetchResult(blobUrl, requestId, 'stderr');
        const stdout = await fetchResult(blobUrl, requestId, 'stderr');
        clearInterval(interval);
        resolve({ stderr, stdout });
      } catch(error) {
        if(!(error instanceof NotFoundError)) {
          clearInterval(interval);
          reject(error);
        }
      }
    }, timeout);
  });
}

async function fetchResult(blobUrl, requestId, pipename) {
  const response = await fetch(`${blobUrl}instance/${requestId}/${pipename}.txt`);
  if (!response.ok) {
    if (response.status === 404 || response.status === 403) {
      throw new NotFoundError;
    } else {
      console.log(response);
      throw new Error('Error while checking instance state');
    }
  }
  const data = await response.text();
  return data;
}

class NotFoundError extends Error {}

