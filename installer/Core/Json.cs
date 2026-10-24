using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace EndcordInstaller.Core
{
    /// <summary>Insertion-ordered JSON object (keeps settings files diff-friendly).</summary>
    public sealed class JsonObject : IEnumerable<KeyValuePair<string, object>>
    {
        readonly List<string> _keys = new List<string>();
        readonly Dictionary<string, object> _map = new Dictionary<string, object>(StringComparer.Ordinal);

        public int Count { get { return _keys.Count; } }
        public IList<string> Keys { get { return _keys.AsReadOnly(); } }

        public bool ContainsKey(string key) { return _map.ContainsKey(key); }

        public object this[string key]
        {
            get { object v; return _map.TryGetValue(key, out v) ? v : null; }
            set
            {
                if (!_map.ContainsKey(key)) _keys.Add(key);
                _map[key] = value;
            }
        }

        public bool Remove(string key)
        {
            if (!_map.Remove(key)) return false;
            _keys.Remove(key);
            return true;
        }

        public JsonObject GetObject(string key) { return this[key] as JsonObject; }

        public bool GetBool(string key, bool fallback)
        {
            object v = this[key];
            return v is bool ? (bool)v : fallback;
        }

        public IEnumerator<KeyValuePair<string, object>> GetEnumerator()
        {
            foreach (var k in _keys) yield return new KeyValuePair<string, object>(k, _map[k]);
        }

        IEnumerator IEnumerable.GetEnumerator() { return GetEnumerator(); }
    }

    /// <summary>Numbers are kept verbatim so re-serialising never changes precision.</summary>
    public sealed class JsonNumber
    {
        public readonly string Raw;
        public JsonNumber(string raw) { Raw = raw; }
        public override string ToString() { return Raw; }
        public override bool Equals(object obj) { var o = obj as JsonNumber; return o != null && o.Raw == Raw; }
        public override int GetHashCode() { return Raw.GetHashCode(); }
    }

    public static class Json
    {
        public static object Parse(string text)
        {
            if (text == null) throw new ArgumentNullException("text");
            var p = new Parser(text);
            p.SkipWs();
            object v = p.ReadValue();
            p.SkipWs();
            if (!p.End) throw p.Error("Unexpected trailing characters");
            return v;
        }

        public static JsonObject ParseObject(string text)
        {
            var o = Parse(text) as JsonObject;
            if (o == null) throw new FormatException("JSON root is not an object");
            return o;
        }

        public static object DeepClone(object v)
        {
            var o = v as JsonObject;
            if (o != null)
            {
                var c = new JsonObject();
                foreach (var kv in o) c[kv.Key] = DeepClone(kv.Value);
                return c;
            }
            var l = v as List<object>;
            if (l != null)
            {
                var c = new List<object>(l.Count);
                foreach (var item in l) c.Add(DeepClone(item));
                return c;
            }
            return v; // strings, numbers, bools and null are immutable
        }

        public static string Serialize(object value)
        {
            var sb = new StringBuilder();
            Write(sb, value, 0);
            return sb.ToString();
        }

        static void Indent(StringBuilder sb, int level) { sb.Append(' ', level * 4); }

        static void Write(StringBuilder sb, object v, int level)
        {
            if (v == null) { sb.Append("null"); return; }
            if (v is bool) { sb.Append((bool)v ? "true" : "false"); return; }
            if (v is JsonNumber) { sb.Append(((JsonNumber)v).Raw); return; }
            if (v is int || v is long || v is double || v is float || v is decimal)
            {
                sb.Append(Convert.ToString(v, CultureInfo.InvariantCulture));
                return;
            }
            var s = v as string;
            if (s != null) { WriteString(sb, s); return; }

            var o = v as JsonObject;
            if (o != null)
            {
                if (o.Count == 0) { sb.Append("{}"); return; }
                sb.Append("{\n");
                int i = 0;
                foreach (var kv in o)
                {
                    Indent(sb, level + 1);
                    WriteString(sb, kv.Key);
                    sb.Append(": ");
                    Write(sb, kv.Value, level + 1);
                    if (++i < o.Count) sb.Append(',');
                    sb.Append('\n');
                }
                Indent(sb, level);
                sb.Append('}');
                return;
            }

            var l = v as IList;
            if (l != null)
            {
                if (l.Count == 0) { sb.Append("[]"); return; }
                sb.Append("[\n");
                for (int i = 0; i < l.Count; i++)
                {
                    Indent(sb, level + 1);
                    Write(sb, l[i], level + 1);
                    if (i < l.Count - 1) sb.Append(',');
                    sb.Append('\n');
                }
                Indent(sb, level);
                sb.Append(']');
                return;
            }

            WriteString(sb, v.ToString());
        }

        static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20 || c == '\u2028' || c == '\u2029')
                            sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else
                            sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        sealed class Parser
        {
            readonly string _s;
            int _i;

            public Parser(string s)
            {
                _s = s;
                _i = (s.Length > 0 && s[0] == '\uFEFF') ? 1 : 0;
            }

            public bool End { get { return _i >= _s.Length; } }

            public FormatException Error(string msg)
            {
                return new FormatException(msg + " at position " + _i);
            }

            public void SkipWs()
            {
                while (_i < _s.Length)
                {
                    char c = _s[_i];
                    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') _i++;
                    else break;
                }
            }

            public object ReadValue()
            {
                if (End) throw Error("Unexpected end of input");
                char c = _s[_i];
                switch (c)
                {
                    case '{': return ReadObject();
                    case '[': return ReadArray();
                    case '"': return ReadString();
                    case 't': Expect("true"); return true;
                    case 'f': Expect("false"); return false;
                    case 'n': Expect("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return ReadNumber();
                        throw Error("Unexpected character '" + c + "'");
                }
            }

            void Expect(string word)
            {
                if (string.CompareOrdinal(_s, _i, word, 0, word.Length) != 0) throw Error("Expected " + word);
                _i += word.Length;
            }

            JsonObject ReadObject()
            {
                var o = new JsonObject();
                _i++; // {
                SkipWs();
                if (!End && _s[_i] == '}') { _i++; return o; }
                while (true)
                {
                    SkipWs();
                    if (End || _s[_i] != '"') throw Error("Expected property name");
                    string key = ReadString();
                    SkipWs();
                    if (End || _s[_i] != ':') throw Error("Expected ':'");
                    _i++;
                    SkipWs();
                    o[key] = ReadValue();
                    SkipWs();
                    if (End) throw Error("Unterminated object");
                    if (_s[_i] == ',') { _i++; continue; }
                    if (_s[_i] == '}') { _i++; return o; }
                    throw Error("Expected ',' or '}'");
                }
            }

            List<object> ReadArray()
            {
                var l = new List<object>();
                _i++; // [
                SkipWs();
                if (!End && _s[_i] == ']') { _i++; return l; }
                while (true)
                {
                    SkipWs();
                    l.Add(ReadValue());
                    SkipWs();
                    if (End) throw Error("Unterminated array");
                    if (_s[_i] == ',') { _i++; continue; }
                    if (_s[_i] == ']') { _i++; return l; }
                    throw Error("Expected ',' or ']'");
                }
            }

            string ReadString()
            {
                _i++; // opening quote
                var sb = new StringBuilder();
                while (true)
                {
                    if (End) throw Error("Unterminated string");
                    char c = _s[_i++];
                    if (c == '"') return sb.ToString();
                    if (c != '\\') { sb.Append(c); continue; }
                    if (End) throw Error("Unterminated escape");
                    char e = _s[_i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (_i + 4 > _s.Length) throw Error("Bad unicode escape");
                            int code;
                            if (!int.TryParse(_s.Substring(_i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out code))
                                throw Error("Bad unicode escape");
                            sb.Append((char)code);
                            _i += 4;
                            break;
                        default: throw Error("Bad escape '\\" + e + "'");
                    }
                }
            }

            JsonNumber ReadNumber()
            {
                int start = _i;
                if (_s[_i] == '-') _i++;
                while (_i < _s.Length)
                {
                    char c = _s[_i];
                    if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') _i++;
                    else break;
                }
                string raw = _s.Substring(start, _i - start);
                double tmp;
                if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out tmp))
                    throw Error("Invalid number '" + raw + "'");
                return new JsonNumber(raw);
            }
        }
    }
}
