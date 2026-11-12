//! Transparent huge pages for large buffers: on Linux, 4 KiB first-touch page
//! faults dominated big-image decodes. A copy lives in `blazediff-png`.

/// Smallest buffer worth a syscall: it always spans one aligned huge page.
#[cfg(target_os = "linux")]
const MIN_LEN: usize = 4 << 20;

/// Asks the kernel to back `vec`'s capacity with 2 MiB pages; call it before
/// the first write, because touched pages stay small.
#[cfg(target_os = "linux")]
pub(crate) fn advise<T>(vec: &Vec<T>) {
    const HUGE_PAGE: usize = 2 << 20;
    const MADV_HUGEPAGE: i32 = 14;
    extern "C" {
        fn madvise(addr: *mut core::ffi::c_void, len: usize, advice: i32) -> i32;
    }

    let len = vec.capacity() * core::mem::size_of::<T>();
    if len < MIN_LEN {
        return;
    }
    let start = (vec.as_ptr() as usize).next_multiple_of(HUGE_PAGE);
    let end = (vec.as_ptr() as usize + len) & !(HUGE_PAGE - 1);
    if end <= start {
        return;
    }
    // SAFETY: [start, end) lies inside the live allocation, and MADV_HUGEPAGE
    // only changes how the kernel backs those pages, never their contents.
    unsafe { madvise(start as *mut core::ffi::c_void, end - start, MADV_HUGEPAGE) };
}

#[cfg(not(target_os = "linux"))]
pub(crate) fn advise<T>(_vec: &Vec<T>) {}
