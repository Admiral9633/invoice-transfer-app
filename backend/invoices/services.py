import requests
from django.conf import settings
from typing import Tuple, Dict, Any
import logging

logger = logging.getLogger(__name__)


class LexwareService:
    """Service for Lexware Office API integration"""
    
    def __init__(self):
        self.api_url = settings.LEXWARE_API_URL
        self.api_key = settings.LEXWARE_API_KEY
        self.client_id = settings.LEXWARE_CLIENT_ID
    
    def upload_invoice(self, file_path: str, filename: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Upload invoice to Lexware Office
        
        Returns:
            Tuple of (success: bool, response_data: dict)
        """
        if not self.api_url or not self.api_key:
            logger.warning('Lexware API credentials not configured')
            return False, {'error': 'Lexware API not configured'}
        
        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'X-Client-ID': self.client_id,
            }
            
            with open(file_path, 'rb') as f:
                files = {'file': (filename, f, 'application/pdf')}
                
                response = requests.post(
                    f'{self.api_url}/invoices/upload',
                    headers=headers,
                    files=files,
                    timeout=30
                )
            
            if response.status_code in [200, 201]:
                logger.info(f'Successfully uploaded {filename} to Lexware')
                return True, response.json()
            else:
                logger.error(f'Lexware upload failed: {response.status_code} - {response.text}')
                return False, {
                    'error': f'Upload failed with status {response.status_code}',
                    'details': response.text
                }
        
        except requests.RequestException as e:
            logger.error(f'Lexware upload error: {str(e)}')
            return False, {'error': str(e)}
        except Exception as e:
            logger.error(f'Unexpected error in Lexware upload: {str(e)}')
            return False, {'error': str(e)}


class PaperlessService:
    """Service for Paperless-ngx API integration"""
    
    def __init__(self):
        self.api_url = settings.PAPERLESS_URL
        self.token = settings.PAPERLESS_TOKEN
    
    def upload_document(self, file_path: str, filename: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Upload document to Paperless-ngx
        
        Returns:
            Tuple of (success: bool, response_data: dict)
        """
        if not self.api_url or not self.token:
            logger.warning('Paperless-ngx API credentials not configured')
            return False, {'error': 'Paperless-ngx API not configured'}
        
        try:
            headers = {
                'Authorization': f'Token {self.token}',
            }
            
            with open(file_path, 'rb') as f:
                files = {'document': (filename, f, 'application/pdf')}
                data = {
                    'title': filename,
                }
                
                response = requests.post(
                    f'{self.api_url}/api/documents/post_document/',
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=30
                )
            
            if response.status_code in [200, 201]:
                logger.info(f'Successfully uploaded {filename} to Paperless-ngx')
                return True, response.json()
            else:
                logger.error(f'Paperless upload failed: {response.status_code} - {response.text}')
                return False, {
                    'error': f'Upload failed with status {response.status_code}',
                    'details': response.text
                }
        
        except requests.RequestException as e:
            logger.error(f'Paperless upload error: {str(e)}')
            return False, {'error': str(e)}
        except Exception as e:
            logger.error(f'Unexpected error in Paperless upload: {str(e)}')
            return False, {'error': str(e)}
