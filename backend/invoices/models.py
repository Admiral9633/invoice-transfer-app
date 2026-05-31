from django.db import models
from django.utils import timezone


class Invoice(models.Model):
    """Model to store invoice uploads and transfer status"""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]
    
    file = models.FileField(upload_to='invoices/%Y/%m/%d/')
    filename = models.CharField(max_length=255)
    file_size = models.IntegerField(help_text='File size in bytes')
    
    # Status tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Lexware transfer
    lexware_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    lexware_response = models.JSONField(null=True, blank=True)
    lexware_transferred_at = models.DateTimeField(null=True, blank=True)
    
    # Paperless transfer
    paperless_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    paperless_response = models.JSONField(null=True, blank=True)
    paperless_document_id = models.IntegerField(null=True, blank=True)
    paperless_transferred_at = models.DateTimeField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.filename} - {self.status}"
    
    def update_overall_status(self):
        """Update overall status based on individual transfer statuses"""
        if self.lexware_status == 'failed' or self.paperless_status == 'failed':
            self.status = 'failed'
        elif self.lexware_status == 'success' and self.paperless_status == 'success':
            self.status = 'success'
        elif self.lexware_status == 'processing' or self.paperless_status == 'processing':
            self.status = 'processing'
        else:
            self.status = 'pending'
        self.save()
