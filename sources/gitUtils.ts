import * as httpUtils from './httpUtils';

export async function lsRemote(url: string) {
  const data = await httpUtils.fetchAsBuffer(`${url}/info/refs?service=git-upload-pack`);
  const refs = new Set<string>();

  let t = 0;
  while (t < data.length) {
    const lenMarker = data.slice(t, t + 4).toString();
    const len = parseInt(lenMarker, 16);

    // flush-pkt
    if (len === 0) {
      t += 4;
      continue;
    }

    // Substract 1 to remove the trailing newline
    const line = data.slice(t + 4, t + len - 1).toString();
    t += len;

    if (line.startsWith(`#`))
      continue;

    let nameEnd = line.indexOf(`\0`);
    if (nameEnd === -1)
      nameEnd = line.length;

    const nameStart = line.indexOf(` `);
    if (nameStart === -1 || nameStart >= nameEnd)
      continue;

    const name = line.slice(nameStart + 1, nameEnd);
    if (name === `capabilities^{}`)
      return new Set<string>();

    refs.add(name);
  }

  return refs;
}

// smart_reply     =  PKT-LINE("# service=$servicename" LF)
//                    ref_list
//                    "0000"
//
// ref_list        =  empty_list / non_empty_list
//
// empty_list      =  PKT-LINE(zero-id SP "capabilities^{}" NUL cap-list LF)
//
// non_empty_list  =  PKT-LINE(obj-id SP name NUL cap_list LF)
//                    *ref_record
//
// cap-list        =  capability *(SP capability)
// capability      =  1*(LC_ALPHA / DIGIT / "-" / "_")
// LC_ALPHA        =  %x61-7A

// ref_record      =  any_ref / peeled_ref
// any_ref         =  PKT-LINE(obj-id SP name LF)
// peeled_ref      =  PKT-LINE(obj-id SP name LF)
