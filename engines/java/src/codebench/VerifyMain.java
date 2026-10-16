// CodeBench — standalone Java verifier.
//
// Runs the fixed verification cases plus one untimed operation on the exact
// measured input, and writes an FNV-1a 64 checksum sidecar (same JSON format
// as the C++ and Python engines) to the path in CB_VERIFY_OUT.
//
// Copyright © 2026 Parsa Fathi — Apache-2.0 (see LICENSE)

package codebench;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public final class VerifyMain {

    public static void main(String[] args) throws Exception {
        String variant = env("CB_VARIANT", "merge_sort");
        String dataset = env("CB_DATASET", "random_int");
        int size = Integer.parseInt(env("CB_SIZE", "10000"));
        long seed = Long.parseUnsignedLong(env("CB_SEED", "1"));
        String out = env("CB_VERIFY_OUT", null);

        String inputHex = Algorithms.fnv1aHex(Algorithms.canonicalInputFor(dataset, size, seed));
        String outputHex = Algorithms.fnv1aHex(Algorithms.verifyOutput(variant, dataset, size, seed));
        String cases = Algorithms.verifyCasesJson(variant);

        String json = "{\"variant\":\"" + variant + "\""
                + ",\"input\":\"" + inputHex + "\""
                + ",\"output\":\"" + outputHex + "\""
                + ",\"cases\":" + cases + "}";

        if (out != null) {
            Path p = Paths.get(out);
            try (OutputStream os = Files.newOutputStream(p)) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }
        } else {
            System.out.println(json);
        }
    }

    private static String env(String k, String dflt) {
        String v = System.getenv(k);
        return v == null ? dflt : v;
    }
}
