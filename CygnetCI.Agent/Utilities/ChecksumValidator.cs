using System.Security.Cryptography;

namespace CygnetCI.Agent.Utilities;

public static class ChecksumValidator
{
    public static string CalculateMD5(string filePath)
    {
        using var md5 = MD5.Create();
        using var stream = File.OpenRead(filePath);
        var hash = md5.ComputeHash(stream);
        return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
    }

    public static bool ValidateChecksum(string filePath, string expectedChecksum)
    {
        var actualChecksum = CalculateMD5(filePath);
        return actualChecksum.Equals(expectedChecksum, StringComparison.OrdinalIgnoreCase);
    }
}
