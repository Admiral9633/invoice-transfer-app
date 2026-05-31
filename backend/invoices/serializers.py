from rest_framework import serializers
from .models import Invoice


class InvoiceSerializer(serializers.ModelSerializer):
    """Serializer for Invoice model"""
    
    class Meta:
        model = Invoice
        fields = [
            'id',
            'file',
            'filename',
            'file_size',
            'status',
            'lexware_status',
            'lexware_response',
            'lexware_transferred_at',
            'paperless_status',
            'paperless_response',
            'paperless_document_id',
            'paperless_transferred_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'filename',
            'file_size',
            'status',
            'lexware_status',
            'lexware_response',
            'lexware_transferred_at',
            'paperless_status',
            'paperless_response',
            'paperless_document_id',
            'paperless_transferred_at',
            'created_at',
            'updated_at',
        ]


class InvoiceUploadSerializer(serializers.Serializer):
    """Serializer for invoice file upload"""
    
    file = serializers.FileField()
    
    def validate_file(self, value):
        """Validate that the uploaded file is a PDF"""
        if not value.name.lower().endswith('.pdf'):
            raise serializers.ValidationError('Only PDF files are allowed.')
        
        # Check file size (10MB limit)
        if value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError('File size must not exceed 10MB.')
        
        return value
