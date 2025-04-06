export async function isImageUrl(url:string) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type');
  
      if (contentType && contentType.startsWith('image/')) {
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking image URL:', error);
      return false; // Handle errors gracefully
    }
  }