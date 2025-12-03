using System.Text.Json.Serialization;

namespace CygnetCI.Agent.Models;

public class TransferFilePickup
{
    [JsonPropertyName("pickup_id")]
    public int Id { get; set; }

    [JsonPropertyName("transfer_file_id")]
    public int TransferFileId { get; set; }

    [JsonPropertyName("file_name")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("file_type")]
    public string FileType { get; set; } = string.Empty;

    [JsonPropertyName("version")]
    public string Version { get; set; } = string.Empty;

    [JsonPropertyName("checksum")]
    public string? Checksum { get; set; }

    [JsonPropertyName("file_size_bytes")]
    public long? FileSizeBytes { get; set; }
}
