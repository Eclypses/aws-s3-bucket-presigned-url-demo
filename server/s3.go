package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const presignExpiry = 5 * time.Minute

type s3Client struct {
	bucket  string
	client  *s3.Client
	presign *s3.PresignClient
}

func newS3Client(ctx context.Context, bucket, region string) (*s3Client, error) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(cfg)
	return &s3Client{
		bucket:  bucket,
		client:  client,
		presign: s3.NewPresignClient(client),
	}, nil
}

type fileInfo struct {
	Name         string    `json:"name"`
	Size         int64     `json:"size"`
	LastModified time.Time `json:"lastModified"`
}

func (c *s3Client) handleList(w http.ResponseWriter, r *http.Request) {
	files := []fileInfo{}
	paginator := s3.NewListObjectsV2Paginator(c.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(c.bucket),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(r.Context())
		if err != nil {
			writeError(w, http.StatusBadGateway, "failed to list bucket: "+err.Error())
			return
		}
		for _, obj := range page.Contents {
			files = append(files, fileInfo{
				Name:         aws.ToString(obj.Key),
				Size:         aws.ToInt64(obj.Size),
				LastModified: aws.ToTime(obj.LastModified),
			})
		}
	}
	writeJSON(w, http.StatusOK, files)
}

// handleUpload returns a presigned PUT URL; the browser uploads directly to S3.
func (c *s3Client) handleUpload(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if !validKey(req.Filename) {
		writeError(w, http.StatusBadRequest, "invalid filename")
		return
	}
	presigned, err := c.presign.PresignPutObject(r.Context(), &s3.PutObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(req.Filename),
	}, s3.WithPresignExpires(presignExpiry))
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to presign upload: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": presigned.URL})
}

// handleDownload returns a presigned GET URL for one object.
func (c *s3Client) handleDownload(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !validKey(name) {
		writeError(w, http.StatusBadRequest, "invalid filename")
		return
	}
	presigned, err := c.presign.PresignGetObject(r.Context(), &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(name),
	}, s3.WithPresignExpires(presignExpiry))
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to presign download: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": presigned.URL})
}

// validKey keeps object keys to simple flat filenames for the demo.
func validKey(name string) bool {
	if name == "" || len(name) > 512 {
		return false
	}
	return !strings.ContainsAny(name, "/\\")
}
